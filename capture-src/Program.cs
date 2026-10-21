using System.Buffers.Binary;
using System.Text.Json;
using AionDPS.Aion2.Capture;
using AionDPS.Aion2.Protocol;
using PacketDotNet;
using SharpPcap;
using SharpPcap.LibPcap;

var itemIds = args.Length > 0
    ? args[0].Split(',').Select(value => int.TryParse(value, out int id) ? id : 0).Where(id => id > 0).ToHashSet()
    : new HashSet<int> { 610670041 };
if (itemIds.Count == 0) return;
int port = args.Length > 1 && int.TryParse(args[1], out int gamePort) ? gamePort : 13328;
int activePort = 0;
var keepalives = new Dictionary<int, (int Count, DateTime First)>();
var layout = new FrameLayout(0, 2, true, true, 2, 0, 2, 16384, "varint", -4, true);
var reassembler = new TcpReassembler();
var gate = new object();
using var opcodes = JsonDocument.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "opcodes.json")));
var known = opcodes.RootElement.GetProperty("syncOpcodes").EnumerateArray().Select(x => x.GetInt32()).ToHashSet();
var devices = new List<ILiveDevice>();

void InspectFrame(ReadOnlySpan<byte> frame)
{
    if (frame.Length < 2) return;
    int opcode = frame[0] << 8 | frame[1];
    if (opcode == 0x1b56 && frame.Length >= 21 && frame[2] == 1 && frame[3] <= 1)
    {
        int item = unchecked((int)BinaryPrimitives.ReadUInt32LittleEndian(frame[13..]));
        if (!itemIds.Contains(item)) return;
        uint count = BinaryPrimitives.ReadUInt32LittleEndian(frame[17..]);
        uint instance = BinaryPrimitives.ReadUInt32LittleEndian(frame[5..]);
        Console.WriteLine(JsonSerializer.Serialize(new { type = "item", item, count, kind = frame[3], instance, at = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() }));
        return;
    }
    if (opcode != 0xffff || frame.Length < 7) return;
    uint outputSize = BinaryPrimitives.ReadUInt32LittleEndian(frame[2..]);
    if (outputSize > Aion2Lz4.MaxOutput || !Aion2Lz4.TryDecompress(frame[6..], (int)outputSize, out byte[] raw)) return;
    int cursor = 0;
    while (cursor < raw.Length)
    {
        long length = 0;
        int prefix = 0;
        bool complete = false;
        while (prefix < 5 && cursor + prefix < raw.Length)
        {
            byte b = raw[cursor + prefix];
            length |= (long)(b & 0x7f) << (7 * prefix);
            prefix++;
            if ((b & 0x80) == 0) { complete = true; break; }
        }
        long total = length + prefix - 4;
        if (!complete || total - prefix < 2 || cursor + total > raw.Length) break;
        InspectFrame(raw.AsSpan(cursor + prefix, (int)total - prefix));
        cursor += (int)total;
    }
}

if (args.Contains("--selftest"))
{
    var frame = new byte[21];
    frame[0] = 0x1b; frame[1] = 0x56; frame[2] = 1;
    BinaryPrimitives.WriteInt32LittleEndian(frame.AsSpan(13), itemIds.First());
    BinaryPrimitives.WriteUInt32LittleEndian(frame.AsSpan(17), 1);
    var payload = new byte[22];
    payload[0] = 25;
    frame.CopyTo(payload.AsSpan(1));
    var segment = new TcpSegment(DateTime.Now, "server:13328", "client:12345", 1, payload, true);
    foreach (var parsed in reassembler.Push(segment, layout, known)) InspectFrame(parsed.Span);
    return;
}

try
{
    foreach (ILiveDevice device in CaptureDeviceList.Instance.Cast<ILiveDevice>())
    {
        try
        {
            device.Open(new DeviceConfiguration { ReadTimeout = 250, Mode = DeviceModes.None, KernelBufferSize = 8 * 1024 * 1024 });
            device.Filter = "tcp";
            device.OnPacketArrival += (_, capture) =>
            {
                try
                {
                    RawCapture raw = capture.GetPacket();
                    var packet = Packet.ParsePacket(raw.LinkLayerType, raw.Data);
                    var tcp = packet.Extract<TcpPacket>();
                    var ip = packet.Extract<IPPacket>();
                    if (tcp is null || ip is null || tcp.PayloadData is not { Length: > 0 } payload) return;
                    lock (gate)
                    {
                        if (activePort == 0)
                        {
                            if (tcp.SourcePort == port) activePort = port;
                            else if (payload.Length >= 3 && payload[0] == 0x0e && payload[1] == 0 && payload[2] == 0x36)
                            {
                                var now = DateTime.UtcNow;
                                var seen = keepalives.GetValueOrDefault(tcp.SourcePort);
                                if (seen.Count == 0 || now - seen.First > TimeSpan.FromSeconds(10)) seen = (0, now);
                                seen.Count++;
                                keepalives[tcp.SourcePort] = seen;
                                if (seen.Count >= 3) activePort = tcp.SourcePort;
                            }
                            if (activePort > 0) Console.WriteLine(JsonSerializer.Serialize(new { type = "status", state = "connected", port = activePort }));
                        }
                        if (tcp.SourcePort != activePort) return;
                    }
                    var segment = new TcpSegment(raw.Timeval.Date.ToLocalTime(), $"{ip.SourceAddress}:{tcp.SourcePort}", $"{ip.DestinationAddress}:{tcp.DestinationPort}", tcp.SequenceNumber, payload, true);
                    lock (gate) foreach (var frame in reassembler.Push(segment, layout, known)) InspectFrame(frame.Span);
                }
                catch (Exception ex) { Console.Error.WriteLine(ex.Message); }
            };
            device.StartCapture();
            devices.Add(device);
        }
        catch (PcapException) { device.Dispose(); }
    }
    Console.WriteLine(JsonSerializer.Serialize(new { type = "status", state = devices.Count == 0 ? "unavailable" : activePort > 0 ? "connected" : "searching", adapters = devices.Count, port = activePort }));
    if (devices.Count == 0) return;
    Console.ReadLine();
}
catch (Exception ex)
{
    Console.WriteLine(JsonSerializer.Serialize(new { type = "status", state = "error", message = ex.Message }));
}
finally
{
    foreach (var device in devices) { device.StopCapture(); device.Dispose(); }
}
