namespace AionDPS.Aion2.Protocol;

public sealed record FrameLayout(int LengthOffset, int LengthSize, bool LittleEndian, bool LengthIncludesHeader, int HeaderSize, int OpcodeOffset, int OpcodeSize, int MaxFrameLength, string LengthEncoding = "fixed", int LengthBias = 0, bool OpcodeBigEndian = false)
{
    public bool IsVarint => string.Equals(LengthEncoding, "varint", StringComparison.OrdinalIgnoreCase);
}
