using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class InputRemapTests
{
    const int CapsLock = 0x14, LCtrl = 0xA2, LShift = 0xA0, LAlt = 0xA4, M = 0x4D, LWin = 0x5B, Mouse4 = 0x05, Q = 0x51, E = 0x45, F12 = 0x7B;

    static RemapProfile P(string name, string[] procs, params (string from, string to)[] maps) => new()
    {
        Id = "rmp_" + name, Name = name, Processes = procs.ToList(), Mappings = maps.Select(m => new KeyMapping { From = m.from, To = m.to }).ToList(),
    };

    static InputAction D(int c) => new(c, true);
    static InputAction U(int c) => new(c, false);

    [Fact]
    public void A_key_becomes_another_key_and_is_released_as_that_key()
    {
        var e = new RemapEngine(new[] { P("g", Array.Empty<string>(), ("CapsLock", "LCtrl")) });
        Assert.Equal(new[] { D(LCtrl) }, e.Handle(CapsLock, true, "notepad"));
        Assert.Equal(new[] { U(LCtrl) }, e.Handle(CapsLock, false, "notepad"));
        Assert.Null(e.Handle(Q, true, "notepad")); // not mapped: goes through unchanged
        Assert.True(e.UsesKeyboard); Assert.False(e.UsesMouse);
    }

    [Fact]
    public void A_mouse_side_button_becomes_a_shortcut_but_never_a_sequence()
    {
        var e = new RemapEngine(new[] { P("g", Array.Empty<string>(), ("Mouse4", "Ctrl+Shift+M")) });
        Assert.True(e.UsesMouse);
        Assert.Equal(new[] { D(LCtrl), D(LShift), D(M) }, e.Handle(Mouse4, true, null));
        Assert.Equal(new[] { D(M) }, e.Handle(Mouse4, true, null)); // held: auto-repeat of the key only
        Assert.Equal(new[] { U(M), U(LShift), U(LCtrl) }, e.Handle(Mouse4, false, null));
        Assert.Null(RemapTarget.Parse("A+B"));          // two keys = a macro: not possible
        Assert.Null(RemapTarget.Parse("Ctrl+Ctrl+A"));
        Assert.Null(RemapTarget.Parse("Ctrl+Shift+Alt+Win+A"));
        Assert.True(RemapTarget.Parse("None")!.Disabled);
    }

    [Fact]
    public void A_game_profile_overrides_the_everywhere_profile_key_by_key_only_in_that_game()
    {
        var e = new RemapEngine(new[]
        {
            P("all", Array.Empty<string>(), ("CapsLock", "LCtrl"), ("Q", "E")),
            P("game", new[] { "eldenring" }, ("Q", "None"), ("LWin", "None")),
        });
        Assert.Equal(new[] { D(E) }, e.Handle(Q, true, "chrome")); e.Handle(Q, false, "chrome");
        Assert.Equal(Array.Empty<InputAction>(), e.Handle(Q, true, "EldenRing"));   // switched off in the game (name is case-insensitive)
        Assert.Equal(Array.Empty<InputAction>(), e.Handle(Q, false, "EldenRing"));  // its release is swallowed too
        Assert.Equal(new[] { D(LCtrl) }, e.Handle(CapsLock, true, "eldenring"));   // everywhere-mapping still applies in the game
        Assert.Null(e.Handle(LWin, true, "chrome"));                                // Windows key only off in the game
    }

    [Fact]
    public void Ctrl_Alt_F12_pauses_everything_and_releases_held_keys()
    {
        var paused = new List<bool>();
        var e = new RemapEngine(new[] { P("g", Array.Empty<string>(), ("Mouse4", "Ctrl+Shift+M"), ("F12", "F11")) });
        e.PausedChanged += paused.Add;
        e.Handle(Mouse4, true, null); // held as Ctrl+Shift+M
        Assert.Null(e.Handle(LCtrl, true, null)); Assert.Null(e.Handle(LAlt, true, null));
        Assert.Equal(new[] { U(M), U(LShift), U(LCtrl) }, e.Handle(F12, true, null)); // emergency stop wins over the F12 mapping
        Assert.True(e.Paused); Assert.Equal(new[] { true }, paused);
        Assert.Equal(Array.Empty<InputAction>(), e.Handle(F12, false, null));
        e.Handle(LCtrl, false, null); e.Handle(LAlt, false, null);
        Assert.Null(e.Handle(Mouse4, false, null)); // already released above
        Assert.Null(e.Handle(Mouse4, true, null));  // paused: original button
        Assert.Null(e.Handle(Mouse4, false, null));
        e.Handle(LCtrl, true, null); e.Handle(LAlt, true, null); e.Handle(F12, true, null);
        Assert.False(e.Paused);
        e.Handle(F12, false, null); e.Handle(LCtrl, false, null); e.Handle(LAlt, false, null);
        Assert.Equal(new[] { D(F11) }, e.Handle(F12, true, null)); // F12 alone is mapped as set
    }
    const int F11 = 0x7A;

    sealed class FakeHook : IInputHook
    {
        public bool Supported { get; init; } = true;
        public Func<int, bool, string?, InputAction[]?>? Handler;
        public bool Keyboard, Mouse, Running;
        public int? Next;
        public void Start(Func<int, bool, string?, InputAction[]?> handle, bool keyboard, bool mouse) { Handler = handle; Keyboard = keyboard; Mouse = mouse; Running = true; }
        public void Stop() { Running = false; Handler = null; }
        public Task<int?> CaptureNextAsync(TimeSpan timeout, CancellationToken ct) => Task.FromResult(Next);
        public List<InputDevice> Devices() => new()
        {
            new("keyboard", "RK84 Wireless Mechanical Keyboard", "SINO WEALTH", "258A", "00C0"),
            new("mouse", "ATTACK SHARK X11", "Compx", "1D57", "FA60"),
            new("keyboard", "HID-Tastatur", null, null, null),
        };
    }

    [Fact]
    public void The_service_installs_only_the_needed_hooks_and_checks_every_profile()
    {
        using var dir = new TempDir();
        var hook = new FakeHook();
        using var s = new InputRemapService(new AppPaths(dir.Path), hook, new NullHub());
        Assert.False(hook.Running); // nothing set up: no hook at all

        s.Save(P("all", Array.Empty<string>(), ("CapsLock", "LCtrl")));
        Assert.True(hook.Running); Assert.True(hook.Keyboard); Assert.False(hook.Mouse); // no mouse hook without a mouse mapping
        var p = s.Save(P("shooter", new[] { "cs2.exe", "CS2" }, ("Mouse5", "MouseMiddle")));
        Assert.Equal(new[] { "cs2" }, p.Processes); // ".exe" removed, duplicates gone
        Assert.True(hook.Mouse);

        string Err(RemapProfile x) => Assert.Throws<RpcException>(() => s.Save(x)).Message;
        Assert.Contains("linke Maustaste", Err(P("x", Array.Empty<string>(), ("MouseLeft", "Q"))));
        Assert.Contains("doppelt", Err(P("x", Array.Empty<string>(), ("Q", "E"), ("q", "R"))));
        Assert.Contains("Ungültige Belegung", Err(P("x", Array.Empty<string>(), ("Q", "E+R"))));
        Assert.Contains("Unbekannte Taste", Err(P("x", Array.Empty<string>(), ("Hyper", "E"))));
        Assert.Contains("Höchstens", Err(new RemapProfile { Id = "rmp_big", Name = "big", Mappings = Enumerable.Range(0, 101).Select(_ => new KeyMapping { From = "Q", To = "E" }).ToList() }));
        Assert.Contains("Programmname", Err(P("x", new[] { "C:\\Games\\a.exe" }, ("Q", "E"))));

        s.SetEnabled("rmp_shooter", false);
        Assert.False(hook.Mouse);
        s.SetEnabled("rmp_all", false);
        Assert.False(hook.Running); // everything off: hooks removed again
    }

    [Fact]
    public void Saving_a_profile_while_a_key_is_held_still_releases_the_mapped_key()
    {
        using var dir = new TempDir();
        var hook = new FakeHook();
        using var s = new InputRemapService(new AppPaths(dir.Path), hook, new NullHub());
        s.Save(P("all", Array.Empty<string>(), ("CapsLock", "LCtrl")));
        Assert.Equal(new[] { D(LCtrl) }, hook.Handler!(CapsLock, true, null));
        s.Save(P("all", Array.Empty<string>(), ("CapsLock", "Esc"))); // changed while CapsLock is down
        Assert.Equal(new[] { U(LCtrl) }, hook.Handler!(CapsLock, false, null));
        Assert.Equal(new[] { D(0x1B) }, hook.Handler!(CapsLock, true, null));
    }

    [Fact]
    public async Task Picking_a_key_on_the_pc_and_honest_answers_without_windows()
    {
        using var dir = new TempDir();
        var hook = new FakeHook { Next = Mouse4 };
        using var s = new InputRemapService(new AppPaths(dir.Path), hook, new NullHub());
        var r = await s.CaptureAsync(CancellationToken.None);
        Assert.Equal("Mouse4", r.GetType().GetProperty("key")!.GetValue(r));
        hook.Next = null;
        Assert.Equal("timeout", (await Assert.ThrowsAsync<RpcException>(() => s.CaptureAsync(CancellationToken.None))).Code);

        var brands = hook.Devices().Select(InputRemapService.Brand).ToArray();
        Assert.Equal(new string?[] { "Royal Kludge", "Attack Shark", null }, brands);

        using var dir2 = new TempDir();
        using var none = new InputRemapService(new AppPaths(dir2.Path), NullInputHook.Instance, new NullHub());
        none.Save(P("all", Array.Empty<string>(), ("CapsLock", "LCtrl"))); // can be prepared without Windows
        Assert.Equal("not-supported", (await Assert.ThrowsAsync<RpcException>(() => none.CaptureAsync(CancellationToken.None))).Code);
    }
}
