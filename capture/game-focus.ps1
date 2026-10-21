Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class FieldbookForegroundWindow {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
}
'@

$lastState = ''
while ($true) {
    $state = 'other'
    $foregroundWindow = [FieldbookForegroundWindow]::GetForegroundWindow()
    if ($foregroundWindow -ne [IntPtr]::Zero) {
        [uint32]$foregroundProcessId = 0
        [void][FieldbookForegroundWindow]::GetWindowThreadProcessId($foregroundWindow, [ref]$foregroundProcessId)
        try {
            $foregroundProcess = [System.Diagnostics.Process]::GetProcessById([int]$foregroundProcessId)
            if ($foregroundProcess.ProcessName -match '(?i)aion.?2') { $state = 'game' }
        } catch {
            $state = 'other'
        }
    }
    if ($state -ne $lastState) {
        [Console]::Out.WriteLine($state)
        [Console]::Out.Flush()
        $lastState = $state
    }
    Start-Sleep -Milliseconds 300
}
