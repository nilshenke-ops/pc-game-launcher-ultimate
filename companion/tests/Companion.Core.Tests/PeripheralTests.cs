using System.Buffers.Binary;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using Pgl.Core.Infrastructure;
using Pgl.Core.Platform;
using Pgl.Core.Rpc;
using Pgl.Core.Services;
using Xunit;

namespace Pgl.Core.Tests;

public class PeripheralTests
{
    // ------------------------------------------------------------------ OpenRGB: server side written from OpenRGBSDK.md

    static void Str(List<byte> b, string s) { var bytes = Encoding.ASCII.GetBytes(s + "\0"); U16(b, (ushort)bytes.Length); b.AddRange(bytes); }
    static void U16(List<byte> b, ushort v) { var x = new byte[2]; BinaryPrimitives.WriteUInt16LittleEndian(x, v); b.AddRange(x); }
    static void U32(List<byte> b, uint v) { var x = new byte[4]; BinaryPrimitives.WriteUInt32LittleEndian(x, v); b.AddRange(x); }

    /// <summary>Controller data block for protocol 4: modes with brightness fields (3+), zones with segments (4+).</summary>
    static byte[] Device(string name, int leds, uint protocol)
    {
        var b = new List<byte>();
        U32(b, 2); // type: keyboard... value irrelevant
        Str(b, name); Str(b, "Vendor X"); Str(b, "desc"); Str(b, "1.0"); Str(b, "SN"); Str(b, "HID: /dev/x");
        U16(b, 2); U32(b, 1); // two modes, active 1
        foreach (var m in new[] { "Direct", "Rainbow" })
        {
            Str(b, m); U32(b, 0); U32(b, 0); U32(b, 0); U32(b, 0);
            if (protocol >= 3) { U32(b, 0); U32(b, 100); }
            U32(b, 0); U32(b, 1); U32(b, 0);
            if (protocol >= 3) U32(b, 100);
            U32(b, 0); U32(b, 1);
            U16(b, 1); U32(b, 0x00FF0000);
        }
        U16(b, 1); // one zone
        Str(b, "Main"); U32(b, 0); U32(b, (uint)leds); U32(b, (uint)leds); U32(b, (uint)leds);
        U16(b, 0); // no matrix
        if (protocol >= 4) { U16(b, 1); Str(b, "Seg"); U32(b, 0); U32(b, 0); U32(b, (uint)leds); }
        U16(b, (ushort)leds);
        for (var i = 0; i < leds; i++) { Str(b, "LED " + i); U32(b, (uint)i); }
        U16(b, (ushort)leds);
        for (var i = 0; i < leds; i++) U32(b, 0);
        var all = new List<byte>(); U32(all, (uint)(b.Count + 4)); all.AddRange(b);
        return all.ToArray();
    }

    sealed class FakeOpenRgb : IAsyncDisposable
    {
        readonly TcpListener _l = new(IPAddress.Loopback, 0);
        public int Port => ((IPEndPoint)_l.LocalEndpoint).Port;
        public List<(uint dev, uint id, byte[] data)> Got = new();
        public uint ServerProtocol = 5;
        public FakeOpenRgb() { _l.Start(); _ = Serve(); }
        async Task Serve()
        {
            using var c = await _l.AcceptTcpClientAsync();
            var s = c.GetStream();
            async Task<byte[]> Read(int n) { var b = new byte[n]; var r = 0; while (r < n) { var k = await s.ReadAsync(b.AsMemory(r)); if (k == 0) throw new IOException(); r += k; } return b; }
            async Task Send(uint dev, uint id, byte[] data)
            {
                var h = new byte[16]; "ORGB"u8.CopyTo(h);
                BinaryPrimitives.WriteUInt32LittleEndian(h.AsSpan(4), dev); BinaryPrimitives.WriteUInt32LittleEndian(h.AsSpan(8), id); BinaryPrimitives.WriteUInt32LittleEndian(h.AsSpan(12), (uint)data.Length);
                await s.WriteAsync(h); await s.WriteAsync(data);
            }
            uint proto = 0;
            try
            {
                while (true)
                {
                    var h = await Read(16);
                    Assert.Equal("ORGB", Encoding.ASCII.GetString(h, 0, 4));
                    var dev = BinaryPrimitives.ReadUInt32LittleEndian(h.AsSpan(4)); var id = BinaryPrimitives.ReadUInt32LittleEndian(h.AsSpan(8));
                    var data = await Read((int)BinaryPrimitives.ReadUInt32LittleEndian(h.AsSpan(12)));
                    lock (Got) Got.Add((dev, id, data));
                    switch (id)
                    {
                        case 40: proto = Math.Min(ServerProtocol, BinaryPrimitives.ReadUInt32LittleEndian(data)); var v = new byte[4]; BinaryPrimitives.WriteUInt32LittleEndian(v, ServerProtocol); await Send(0, 40, v); break;
                        case 0:
                            await Send(0, 100, Array.Empty<byte>()); // unsolicited "device list updated" – the client must skip it
                            var n = new byte[4]; BinaryPrimitives.WriteUInt32LittleEndian(n, 2); await Send(0, 0, n); break;
                        case 1: await Send(dev, 1, Device(dev == 0 ? "Keyboard K70" : "RAM Stick", dev == 0 ? 3 : 5, BinaryPrimitives.ReadUInt32LittleEndian(data))); break;
                        case 150:
                            var p = new List<byte>(); U16(p, 2); Str(p, "Gaming"); Str(p, "Aus");
                            var all = new List<byte>(); U32(all, (uint)(p.Count + 4)); all.AddRange(p); await Send(0, 150, all.ToArray()); break;
                    }
                }
            }
            catch (IOException) { }
        }
        public ValueTask DisposeAsync() { _l.Stop(); return ValueTask.CompletedTask; }
    }

    [Fact]
    public void A_controller_data_block_of_protocol_4_is_read_completely()
    {
        var d = OpenRgbClient.ParseDevice(7, Device("Keyboard K70", 3, 4), 4);
        Assert.Equal(("Keyboard K70", "Vendor X", 3), (d.Name, d.Vendor, d.Leds));
        Assert.Equal(new[] { "Direct", "Rainbow" }, d.Modes);
        Assert.Equal("Main", Assert.Single(d.Zones).Name);
        // protocol 3 has no segments – the same reader must not get out of step
        Assert.Equal(5, OpenRgbClient.ParseDevice(0, Device("x", 5, 3), 3).Leds);
    }

    [Fact]
    public async Task Devices_profiles_and_one_color_for_all_leds_over_the_sdk_protocol()
    {
        await using var server = new FakeOpenRgb();
        using var dir = new TempDir();
        var rgb = new RgbService(new AppPaths(dir.Path));
        rgb.Configure("127.0.0.1", server.Port);
        var st = JsonSerializer.SerializeToElement(await rgb.StatusAsync(), Json.Options);
        Assert.Equal(4, st.GetProperty("protocol").GetInt32()); // server 5, client 4 → 4
        Assert.Equal(new[] { "Keyboard K70", "RAM Stick" }, st.GetProperty("devices").EnumerateArray().Select(d => d.GetProperty("name").GetString()));
        Assert.Equal(new[] { "Gaming", "Aus" }, st.GetProperty("profiles").EnumerateArray().Select(d => d.GetString()));
    }

    [Fact]
    public async Task Setting_a_color_sends_custom_mode_and_one_packet_with_every_led()
    {
        await using var server = new FakeOpenRgb();
        await using var c = new OpenRgbClient();
        await c.ConnectAsync("127.0.0.1", server.Port);
        var devs = await c.DevicesAsync();
        await c.SetColorAsync(devs[1], 0x12, 0x34, 0x56);
        await Task.Delay(200);
        List<(uint dev, uint id, byte[] data)> got; lock (server.Got) got = server.Got.ToList();
        Assert.Contains(got, g => g.id == 50 && Encoding.ASCII.GetString(g.data) == "Nexus Gaming Hub\0");
        Assert.Contains(got, g => g.id == 1100 && g.dev == 1);
        var upd = got.Single(g => g.id == 1050);
        Assert.Equal(1u, upd.dev);
        Assert.Equal((uint)upd.data.Length, BinaryPrimitives.ReadUInt32LittleEndian(upd.data)); // data_size counts itself
        Assert.Equal(5, BinaryPrimitives.ReadUInt16LittleEndian(upd.data.AsSpan(4)));
        Assert.Equal(0x00563412u, BinaryPrimitives.ReadUInt32LittleEndian(upd.data.AsSpan(6))); // RGBColor 0x00BBGGRR
    }

    [Theory]
    [InlineData("127.0.0.1", true)]
    [InlineData("192.168.178.20", true)]
    [InlineData("10.0.0.5", true)]
    [InlineData("8.8.8.8", false)]
    [InlineData("openrgb.example.com", false)]
    public void OpenRGB_is_only_reached_on_this_pc_or_in_the_home_network(string host, bool ok)
    {
        using var dir = new TempDir();
        var rgb = new RgbService(new AppPaths(dir.Path));
        if (ok) rgb.Configure(host, 6742); else Assert.Equal("invalid-params", Assert.Throws<RpcException>(() => rgb.Configure(host, 6742)).Code);
    }

    [Fact]
    public async Task Without_openrgb_running_the_message_says_what_to_do()
    {
        using var dir = new TempDir();
        var rgb = new RgbService(new AppPaths(dir.Path));
        var free = new TcpListener(IPAddress.Loopback, 0); free.Start(); var port = ((IPEndPoint)free.LocalEndpoint).Port; free.Stop();
        rgb.Configure("127.0.0.1", port);
        var ex = await Assert.ThrowsAsync<RpcException>(() => rgb.StatusAsync());
        Assert.Equal("unavailable", ex.Code);
        Assert.Contains("SDK", ex.Message);
    }

    // ------------------------------------------------------------------ window layouts with a simulated window manager

    sealed class FakeWindows : IWindowManager
    {
        public List<MonitorInfo> Mons = new() { new("\\\\.\\DISPLAY1", "Monitor 1", 0, 0, 1920, 1040, true), new("\\\\.\\DISPLAY2", "Monitor 2", 1920, 0, 2560, 1400, false) };
        public List<WindowInfo> Wins = new()
        {
            new(1, "Discord", "Discord", 2000, 100, 1200, 900, "normal", "\\\\.\\DISPLAY2"),
            new(2, "obs64", "OBS 30", 0, 0, 1920, 1040, "maximized", "\\\\.\\DISPLAY1"),
        };
        public List<(long h, int x, int y, int w, int hh, string state)> Placed = new();
        public bool Supported => true;
        public List<MonitorInfo> Monitors() => Mons;
        public List<WindowInfo> Windows() => Wins;
        public string? Place(long handle, int x, int y, int width, int height, string state) { Placed.Add((handle, x, y, width, height, state)); return null; }
    }

    [Fact]
    public void A_layout_puts_windows_back_relative_to_their_monitor_and_reports_missing_ones()
    {
        using var dir = new TempDir();
        var wm = new FakeWindows();
        var svc = new WindowLayoutService(new AppPaths(dir.Path), wm, new NullHub());
        var l = svc.Capture("lay_stream", "Streamen", new[] { "Discord", "obs64", "Spotify" });
        Assert.Equal(2, l.Windows.Count);
        Assert.Equal((80, 100), (l.Windows[0].X, l.Windows[0].Y)); // relative to monitor 2

        wm.Mons[1] = wm.Mons[1] with { X = -2560 }; // second monitor now left of the main one
        wm.Wins.RemoveAt(1);                       // OBS not open
        var r = svc.Apply("lay_stream");
        Assert.Equal((1L, -2480, 100, 1200, 900, "normal"), wm.Placed.Single());
        Assert.Contains(r, x => x.Process == "obs64" && !x.Ok && x.Result.Contains("nicht geöffnet"));

        wm.Mons.RemoveAt(1); // monitor unplugged: window goes to the main monitor, kept inside it
        wm.Placed.Clear();
        r = svc.Apply("lay_stream");
        var p = wm.Placed.Single();
        Assert.True(p.x >= 0 && p.x + p.w <= 1920);
        Assert.Contains("fehlt", r.First(x => x.Process == "Discord").Result);
    }

    [Fact]
    public void Layout_values_are_checked()
    {
        using var dir = new TempDir();
        var svc = new WindowLayoutService(new AppPaths(dir.Path), new FakeWindows(), new NullHub());
        Assert.Throws<RpcException>(() => svc.Save(new WindowLayout { Id = "../x", Name = "x" }));
        Assert.Throws<RpcException>(() => svc.Save(new WindowLayout { Id = "lay_a", Name = "x", Windows = { new LayoutWindow { Process = "cmd.exe & calc", Width = 500, Height = 500 } } }));
        Assert.Throws<RpcException>(() => svc.Save(new WindowLayout { Id = "lay_a", Name = "x", Windows = { new LayoutWindow { Process = "Discord", Width = 99999, Height = 500 } } }));
        Assert.Equal("not-supported", Assert.Throws<RpcException>(() => new WindowLayoutService(new AppPaths(dir.Path), NullWindowManager.Instance, new NullHub()).Apply("lay_a")).Code);
    }

    [Fact]
    public async Task New_steps_are_checked_and_controllers_report_honestly_without_windows()
    {
        using var dir = new TempDir();
        await using var s = Fixtures.Services(dir);
        var admin = await Fixtures.Admin(s);
        Assert.Equal("invalid-params", await admin.Error("quick.save", new { name = "x", steps = new[] { new { type = "rgbColor", @ref = "rot" } } }));
        Assert.Equal("invalid-params", await admin.Error("quick.save", new { name = "x", steps = new[] { new { type = "applyLayout", @ref = "../x" } } }));
        await admin.Ok("quick.save", new { name = "Abend", steps = new[] { new { type = "rgbColor", @ref = "#ff8800" } } });
        var c = await admin.Ok("controllers.list");
        Assert.False(c.GetProperty("supported").GetBoolean());
        Assert.Equal("failed", await admin.Error("controllers.rumble", new { index = 0 }));
    }
}
