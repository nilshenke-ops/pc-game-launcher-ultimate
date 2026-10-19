using System.Runtime.InteropServices;
using Pgl.Core.Platform;

namespace Pgl.Windows;

/// <summary>
/// Presses a key combination of another program (NVIDIA, Xbox Game Bar, Steam, Discord) with SendInput – the same as
/// pressing it on the keyboard. Before that it waits until the user has released the modifier keys of the launcher
/// hotkey that triggered the action, otherwise both combinations would mix (e.g. Ctrl+Shift + Alt+F9).
/// </summary>
sealed class WindowsKeySender : IKeySender
{
    [DllImport("user32.dll", SetLastError = true)] static extern uint SendInput(uint count, INPUT[] inputs, int size);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vk);
    [DllImport("user32.dll")] static extern uint MapVirtualKey(uint code, uint mapType);

    const uint INPUT_KEYBOARD = 1, KEYEVENTF_EXTENDEDKEY = 1, KEYEVENTF_KEYUP = 2;
    const ushort VK_SHIFT = 0x10, VK_CONTROL = 0x11, VK_MENU = 0x12, VK_LWIN = 0x5B, VK_RWIN = 0x5C;

    [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Explicit)] struct InputUnion { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public InputUnion u; }

    public bool Supported => true;

    static bool ModifierDown() => new[] { VK_SHIFT, VK_CONTROL, VK_MENU, VK_LWIN, VK_RWIN }.Any(vk => (GetAsyncKeyState(vk) & 0x8000) != 0);

    static bool Extended(Keys k) => k is Keys.Insert or Keys.Delete or Keys.Home or Keys.End or Keys.PageUp or Keys.PageDown
        or Keys.Up or Keys.Down or Keys.Left or Keys.Right or Keys.Divide or Keys.LWin or Keys.RWin
        or Keys.MediaPlayPause or Keys.MediaNextTrack or Keys.MediaPreviousTrack or Keys.MediaStop or Keys.VolumeMute or Keys.VolumeUp or Keys.VolumeDown;

    static INPUT Key(ushort vk, bool up, bool extended) => new()
    {
        type = INPUT_KEYBOARD,
        u = new InputUnion { ki = new KEYBDINPUT { wVk = vk, wScan = (ushort)MapVirtualKey(vk, 0), dwFlags = (up ? KEYEVENTF_KEYUP : 0) | (extended ? KEYEVENTF_EXTENDEDKEY : 0) } },
    };

    public async Task<string?> SendAsync(string combo)
    {
        if (HotkeyRegistrar.Parse(combo) is not { } parsed) return $"„{combo}“ kann nicht gesendet werden.";
        for (var i = 0; i < 40 && ModifierDown(); i++) await Task.Delay(50); // max. 2 s
        if (ModifierDown()) return "Bitte die Tasten des Launcher-Hotkeys loslassen – erst dann kann die Tastenkombination gesendet werden.";

        var mods = new List<(ushort vk, bool ext)>();
        foreach (var part in combo.Split('+'))
            switch (part)
            {
                case "Ctrl": mods.Add((VK_CONTROL, false)); break;
                case "Alt": mods.Add((VK_MENU, false)); break;
                case "Shift": mods.Add((VK_SHIFT, false)); break;
                case "Win": mods.Add((VK_LWIN, true)); break;
            }
        var key = (ushort)parsed.key;
        var inputs = new List<INPUT>();
        foreach (var m in mods) inputs.Add(Key(m.vk, false, m.ext));
        inputs.Add(Key(key, false, Extended(parsed.key)));
        inputs.Add(Key(key, true, Extended(parsed.key)));
        foreach (var m in Enumerable.Reverse(mods)) inputs.Add(Key(m.vk, true, m.ext));
        var sent = SendInput((uint)inputs.Count, inputs.ToArray(), Marshal.SizeOf<INPUT>());
        return sent == inputs.Count ? null
            : $"Windows hat die Tastenkombination nicht angenommen (Fehler {Marshal.GetLastWin32Error()}). Läuft das Spiel als Administrator, muss der Launcher es auch.";
    }
}

/// <summary>
/// While a game runs the companion steps back: priority "below normal", Windows efficiency mode (EcoQoS, Windows 11)
/// and its working set is trimmed once (memory goes back to the game). Everything is undone when the game ends.
/// </summary>
sealed class WindowsGameMode : IGameMode
{
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetProcessInformation(IntPtr process, int infoClass, ref PROCESS_POWER_THROTTLING_STATE info, int size);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetProcessWorkingSetSizeEx(IntPtr process, nint min, nint max, uint flags);
    [StructLayout(LayoutKind.Sequential)] struct PROCESS_POWER_THROTTLING_STATE { public uint Version, ControlMask, StateMask; }
    const int ProcessPowerThrottling = 4;
    const uint PROCESS_POWER_THROTTLING_EXECUTION_SPEED = 1;

    public string Apply(bool gaming, bool audioLive)
    {
        var parts = new List<string>();
        using var me = System.Diagnostics.Process.GetCurrentProcess();
        var stepBack = gaming && !audioLive; // live microphone: keep audio smooth
        try { me.PriorityClass = stepBack ? System.Diagnostics.ProcessPriorityClass.BelowNormal : System.Diagnostics.ProcessPriorityClass.Normal; parts.Add(stepBack ? "Priorität niedriger" : "Priorität normal"); }
        catch (Exception ex) { parts.Add("Priorität: " + ex.Message); }
        // EcoQoS: lets Windows run the companion on efficiency cores / lower clocks. Unknown before Windows 10 1709 → just false.
        var state = new PROCESS_POWER_THROTTLING_STATE { Version = 1, ControlMask = PROCESS_POWER_THROTTLING_EXECUTION_SPEED, StateMask = stepBack ? PROCESS_POWER_THROTTLING_EXECUTION_SPEED : 0 };
        if (SetProcessInformation(me.Handle, ProcessPowerThrottling, ref state, Marshal.SizeOf<PROCESS_POWER_THROTTLING_STATE>())) parts.Add(stepBack ? "Effizienzmodus an" : "Effizienzmodus aus");
        if (gaming && audioLive) parts.Add("Mikrofon-Durchleitung aktiv – Priorität bleibt normal");
        if (gaming)
        {
            GC.Collect(2, GCCollectionMode.Optimized, blocking: false);
            if (SetProcessWorkingSetSizeEx(me.Handle, -1, -1, 0)) parts.Add("Arbeitsspeicher freigegeben");
        }
        return (gaming ? "Spiel läuft: " : "Kein Spiel mehr: ") + string.Join(", ", parts);
    }
}
