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
        or Keys.Up or Keys.Down or Keys.Left or Keys.Right or Keys.Divide or Keys.LWin or Keys.RWin;

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
