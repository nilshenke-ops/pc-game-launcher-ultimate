using System.Runtime.InteropServices;
using Pgl.Core.Platform;

namespace Pgl.Windows;

/// <summary>Global hotkeys through RegisterHotKey on a hidden message window (UI thread).</summary>
public sealed class HotkeyRegistrar : IHotkeyRegistrar
{
    [DllImport("user32.dll", SetLastError = true)] static extern bool RegisterHotKey(IntPtr hWnd, int id, uint mods, uint vk);
    [DllImport("user32.dll", SetLastError = true)] static extern bool UnregisterHotKey(IntPtr hWnd, int id);
    const uint MOD_ALT = 1, MOD_CONTROL = 2, MOD_SHIFT = 4, MOD_WIN = 8, MOD_NOREPEAT = 0x4000;
    const int WM_HOTKEY = 0x0312;

    readonly UiInvoker _ui;
    readonly Dictionary<int, Action> _handlers = new();
    MessageWindow? _window;

    public HotkeyRegistrar(UiInvoker ui) { _ui = ui; }
    public bool Supported => true;

    sealed class MessageWindow : NativeWindow
    {
        readonly HotkeyRegistrar _owner;
        public MessageWindow(HotkeyRegistrar owner) { _owner = owner; CreateHandle(new CreateParams { Parent = new IntPtr(-3) /* HWND_MESSAGE */ }); }
        protected override void WndProc(ref Message m)
        {
            if (m.Msg == WM_HOTKEY && _owner._handlers.TryGetValue(m.WParam.ToInt32(), out var h)) { try { h(); } catch { } }
            base.WndProc(ref m);
        }
    }

    public static (uint mods, Keys key)? Parse(string combo)
    {
        uint mods = MOD_NOREPEAT;
        Keys? key = null;
        foreach (var part in combo.Split('+'))
        {
            switch (part)
            {
                case "Ctrl": mods |= MOD_CONTROL; break;
                case "Alt": mods |= MOD_ALT; break;
                case "Shift": mods |= MOD_SHIFT; break;
                case "Win": mods |= MOD_WIN; break;
                default:
                    key = part switch
                    {
                        { Length: 1 } when char.IsLetter(part[0]) => Enum.Parse<Keys>(part),
                        { Length: 1 } when char.IsDigit(part[0]) => Enum.Parse<Keys>("D" + part),
                        _ when part.StartsWith("Num") && part.Length == 4 => Enum.Parse<Keys>("NumPad" + part[3]),
                        "NumAdd" => Keys.Add, "NumSubtract" => Keys.Subtract, "NumMultiply" => Keys.Multiply, "NumDivide" => Keys.Divide,
                        "Enter" => Keys.Return, "PageUp" => Keys.PageUp, "PageDown" => Keys.PageDown, "ScrollLock" => Keys.Scroll,
                        "PrintScreen" => Keys.PrintScreen,
                        _ => Enum.TryParse<Keys>(part, out var k) ? k : null,
                    };
                    break;
            }
        }
        return key == null ? null : (mods, key.Value);
    }

    public string? Register(int id, string keys, Action onPressed)
    {
        var parsed = Parse(keys);
        if (parsed == null) return "Taste wird nicht unterstützt.";
        return _ui.Invoke(() =>
        {
            _window ??= new MessageWindow(this);
            if (!RegisterHotKey(_window.Handle, id, parsed.Value.mods, (uint)parsed.Value.key))
            {
                var err = Marshal.GetLastWin32Error();
                return err == 1409 ? "Bereits von Windows oder einem anderen Programm belegt." : $"Registrierung fehlgeschlagen (Fehler {err}).";
            }
            _handlers[id] = onPressed;
            return (string?)null;
        });
    }

    public void Unregister(int id) => _ui.Invoke(() =>
    {
        if (_window != null) UnregisterHotKey(_window.Handle, id);
        _handlers.Remove(id);
    });

    public void UnregisterAll() => _ui.Invoke(() =>
    {
        if (_window != null) foreach (var id in _handlers.Keys.ToList()) UnregisterHotKey(_window.Handle, id);
        _handlers.Clear();
    });
}
