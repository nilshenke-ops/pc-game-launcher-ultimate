using System.Buffers.Binary;
using System.Net;
using System.Net.Sockets;
using System.Text;
using Pgl.Core.Infrastructure;
using Pgl.Core.Rpc;

namespace Pgl.Core.Services;

public sealed record RgbZone(string Name, int Leds);
public sealed record RgbDevice(uint Id, string Name, string Vendor, int Type, int Leds, List<RgbZone> Zones, List<string> Modes, int ActiveMode);

/// <summary>
/// Client for the OpenRGB SDK server (TCP, default port 6742), written from the official protocol description
/// (Documentation/OpenRGBSDK.md). Speaks protocol versions up to 4 (OpenRGB 0.9) – newer servers answer in that version.
/// OpenRGB itself talks to the hardware; this only asks it for devices, colors and profiles.
/// </summary>
public sealed class OpenRgbClient : IAsyncDisposable
{
    public const uint ClientMaxProtocol = 4;
    const uint ReqControllerCount = 0, ReqControllerData = 1, ReqProtocolVersion = 40, SetClientName = 50;
    const uint ProfileList = 150, LoadProfile = 152, UpdateLeds = 1050, SetCustomMode = 1100;
    static readonly byte[] Magic = "ORGB"u8.ToArray();

    readonly TcpClient _tcp = new();
    NetworkStream? _stream;
    public uint Protocol { get; private set; }
    public TimeSpan Timeout { get; init; } = TimeSpan.FromSeconds(3);

    public async Task ConnectAsync(string host, int port, CancellationToken ct = default)
    {
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
        cts.CancelAfter(Timeout);
        try { await _tcp.ConnectAsync(host, port, cts.Token); }
        catch (Exception ex) when (ex is SocketException or OperationCanceledException)
        { throw new RpcException("unavailable", $"OpenRGB nicht erreichbar ({host}:{port}). Läuft OpenRGB mit eingeschaltetem SDK-Server (Reiter „SDK Server“ → „Start Server“)?"); }
        _stream = _tcp.GetStream();
        await SendAsync(0, SetClientName, Encoding.ASCII.GetBytes("Nexus Gaming Hub\0"));
        var v = new byte[4]; BinaryPrimitives.WriteUInt32LittleEndian(v, ClientMaxProtocol);
        await SendAsync(0, ReqProtocolVersion, v);
        // A protocol-0 server does not answer this request.
        var reply = await ReceiveAsync(ReqProtocolVersion, allowTimeout: true);
        Protocol = reply == null ? 0 : Math.Min(ClientMaxProtocol, BinaryPrimitives.ReadUInt32LittleEndian(reply));
    }

    async Task SendAsync(uint dev, uint id, byte[] data)
    {
        var header = new byte[16];
        Magic.CopyTo(header, 0);
        BinaryPrimitives.WriteUInt32LittleEndian(header.AsSpan(4), dev);
        BinaryPrimitives.WriteUInt32LittleEndian(header.AsSpan(8), id);
        BinaryPrimitives.WriteUInt32LittleEndian(header.AsSpan(12), (uint)data.Length);
        await _stream!.WriteAsync(header);
        if (data.Length > 0) await _stream.WriteAsync(data);
    }

    /// <summary>Next packet with this id; packets the server sends on its own (e.g. "device list updated") are skipped.</summary>
    async Task<byte[]?> ReceiveAsync(uint id, bool allowTimeout = false)
    {
        using var cts = new CancellationTokenSource(allowTimeout ? TimeSpan.FromMilliseconds(800) : Timeout);
        try
        {
            while (true)
            {
                var header = await ReadExact(16, cts.Token);
                if (!header.AsSpan(0, 4).SequenceEqual(Magic)) throw new RpcException("failed", "OpenRGB hat eine unerwartete Antwort geschickt.");
                var pid = BinaryPrimitives.ReadUInt32LittleEndian(header.AsSpan(8));
                var size = BinaryPrimitives.ReadUInt32LittleEndian(header.AsSpan(12));
                if (size > 16 * 1024 * 1024) throw new RpcException("failed", "OpenRGB-Antwort zu groß.");
                var body = await ReadExact((int)size, cts.Token);
                if (pid == id) return body;
            }
        }
        catch (OperationCanceledException) when (allowTimeout) { return null; }
        catch (OperationCanceledException) { throw new RpcException("timeout", "OpenRGB antwortet nicht."); }
    }

    async Task<byte[]> ReadExact(int n, CancellationToken ct)
    {
        var buf = new byte[n];
        var read = 0;
        while (read < n)
        {
            var r = await _stream!.ReadAsync(buf.AsMemory(read), ct);
            if (r == 0) throw new RpcException("unavailable", "OpenRGB hat die Verbindung beendet.");
            read += r;
        }
        return buf;
    }

    public async Task<List<RgbDevice>> DevicesAsync()
    {
        await SendAsync(0, ReqControllerCount, Array.Empty<byte>());
        var count = BinaryPrimitives.ReadUInt32LittleEndian(await ReceiveAsync(ReqControllerCount) ?? throw new RpcException("timeout", "OpenRGB antwortet nicht."));
        var list = new List<RgbDevice>();
        for (uint i = 0; i < Math.Min(count, 64); i++)
        {
            var v = new byte[4]; BinaryPrimitives.WriteUInt32LittleEndian(v, Protocol);
            await SendAsync(i, ReqControllerData, Protocol == 0 ? Array.Empty<byte>() : v);
            list.Add(ParseDevice(i, await ReceiveAsync(ReqControllerData) ?? throw new RpcException("timeout", "OpenRGB antwortet nicht."), Protocol));
        }
        return list;
    }

    /// <summary>Controller data block ("Device Data" of the SDK description) for protocol versions 0–4.</summary>
    public static RgbDevice ParseDevice(uint id, byte[] data, uint protocol)
    {
        var r = new Reader(data);
        r.U32(); // data_size
        var type = r.I32();
        var name = r.Str();
        var vendor = protocol >= 1 ? r.Str() : "";
        r.Str(); r.Str(); r.Str(); r.Str(); // description, version, serial, location
        var numModes = r.U16();
        var active = r.I32();
        var modes = new List<string>();
        for (var m = 0; m < numModes; m++)
        {
            modes.Add(r.Str());
            r.I32(); r.U32(); r.U32(); r.U32();          // value, flags, speed min/max
            if (protocol >= 3) { r.U32(); r.U32(); }     // brightness min/max
            r.U32(); r.U32(); r.U32();                   // colors min/max, speed
            if (protocol >= 3) r.U32();                  // brightness
            r.U32(); r.U32();                            // direction, color mode
            r.Skip(4 * r.U16());                         // mode colors
        }
        var zones = new List<RgbZone>();
        var numZones = r.U16();
        for (var z = 0; z < numZones; z++)
        {
            var zn = r.Str();
            r.I32(); r.U32(); r.U32();                   // type, leds min/max
            var leds = (int)r.U32();
            r.Skip(r.U16());                             // matrix map
            if (protocol >= 4)
                for (int s = 0, n = r.U16(); s < n; s++) { r.Str(); r.I32(); r.U32(); r.U32(); }
            zones.Add(new RgbZone(zn, leds));
        }
        var numLeds = r.U16();
        for (var l = 0; l < numLeds; l++) { r.Str(); r.U32(); }
        return new RgbDevice(id, name, vendor, type, numLeds, zones, modes, active);
    }

    /// <summary>One color on every LED of a device (switches it to the "direct/custom" mode first).</summary>
    public async Task SetColorAsync(RgbDevice d, byte red, byte green, byte blue)
    {
        await SendAsync(d.Id, SetCustomMode, Array.Empty<byte>());
        var n = Math.Min(d.Leds, 4096);
        var data = new byte[4 + 2 + 4 * n];
        BinaryPrimitives.WriteUInt32LittleEndian(data, (uint)data.Length);
        BinaryPrimitives.WriteUInt16LittleEndian(data.AsSpan(4), (ushort)n);
        var color = (uint)(red | green << 8 | blue << 16); // RGBColor: 0x00BBGGRR
        for (var i = 0; i < n; i++) BinaryPrimitives.WriteUInt32LittleEndian(data.AsSpan(6 + 4 * i), color);
        await SendAsync(d.Id, UpdateLeds, data);
    }

    public async Task<List<string>> ProfilesAsync()
    {
        if (Protocol < 2) return new();
        await SendAsync(0, ProfileList, Array.Empty<byte>());
        var r = new Reader(await ReceiveAsync(ProfileList) ?? throw new RpcException("timeout", "OpenRGB antwortet nicht."));
        r.U32();
        var list = new List<string>();
        for (int i = 0, n = r.U16(); i < n; i++) list.Add(r.Str());
        return list;
    }

    public Task LoadProfileAsync(string name)
    {
        if (Protocol < 2) throw new RpcException("not-supported", "Profile gibt es erst ab OpenRGB 0.6.");
        return SendAsync(0, LoadProfile, Encoding.UTF8.GetBytes(name + "\0"));
    }

    public ValueTask DisposeAsync() { _tcp.Dispose(); return ValueTask.CompletedTask; }

    sealed class Reader(byte[] b)
    {
        int _p;
        void Need(int n) { if (_p + n > b.Length) throw new RpcException("failed", "OpenRGB-Gerätedaten unvollständig."); }
        public uint U32() { Need(4); var v = BinaryPrimitives.ReadUInt32LittleEndian(b.AsSpan(_p)); _p += 4; return v; }
        public int I32() => (int)U32();
        public ushort U16() { Need(2); var v = BinaryPrimitives.ReadUInt16LittleEndian(b.AsSpan(_p)); _p += 2; return v; }
        public void Skip(int n) { Need(n); _p += n; }
        public string Str() { var n = U16(); Need(n); var s = Encoding.UTF8.GetString(b, _p, Math.Max(0, n - 1)); _p += n; return s; }
    }
}

public sealed class RgbSettings
{
    public string Host { get; set; } = "127.0.0.1";
    public int Port { get; set; } = 6742;
}

/// <summary>RGB lighting through OpenRGB on this PC (or one in the home network). Nothing is sent anywhere else.</summary>
public sealed class RgbService
{
    readonly JsonStore<RgbSettings> _store;
    public RgbService(AppPaths paths) => _store = new JsonStore<RgbSettings>(paths.File("rgb.json"));

    public RgbSettings Settings() => _store.Snapshot();

    public void Configure(string host, int port)
    {
        if (port is < 1 or > 65535) throw new RpcException("invalid-params", "Ungültiger Port.");
        host = host.Trim();
        // Only this PC or a private home-network address – OpenRGB has no password, so nothing on the internet.
        if (!(host == "localhost" || (IPAddress.TryParse(host, out var ip) && (IPAddress.IsLoopback(ip) || IsPrivate(ip)))))
            throw new RpcException("invalid-params", "Nur dieser PC (127.0.0.1) oder eine Adresse im Heimnetz (z. B. 192.168.x.x).");
        _store.Replace(new RgbSettings { Host = host, Port = port });
    }

    static bool IsPrivate(IPAddress ip)
    {
        var b = ip.GetAddressBytes();
        return ip.AddressFamily == AddressFamily.InterNetwork && (b[0] == 10 || (b[0] == 172 && b[1] is >= 16 and <= 31) || (b[0] == 192 && b[1] == 168));
    }

    async Task<T> With<T>(Func<OpenRgbClient, Task<T>> f)
    {
        var s = _store.Snapshot();
        await using var c = new OpenRgbClient();
        await c.ConnectAsync(s.Host, s.Port);
        return await f(c);
    }

    public Task<object> StatusAsync() => With<object>(async c => new { connected = true, protocol = c.Protocol, devices = await c.DevicesAsync(), profiles = await c.ProfilesAsync() });

    public static (byte r, byte g, byte b) ParseColor(string hex)
    {
        if (!System.Text.RegularExpressions.Regex.IsMatch(hex ?? "", "^#[0-9a-fA-F]{6}$")) throw new RpcException("invalid-params", "Farbe als #RRGGBB.");
        return (Convert.ToByte(hex![1..3], 16), Convert.ToByte(hex[3..5], 16), Convert.ToByte(hex[5..7], 16));
    }

    /// <summary>One color on all devices (or one device). Returns how many devices were set.</summary>
    public Task<int> SetColorAsync(string hex, uint? deviceId) => With(async c =>
    {
        var (r, g, b) = ParseColor(hex);
        var devices = (await c.DevicesAsync()).Where(d => deviceId == null || d.Id == deviceId).ToList();
        if (deviceId != null && devices.Count == 0) throw new RpcException("not-found", "Gerät nicht gefunden.");
        foreach (var d in devices) await c.SetColorAsync(d, r, g, b);
        return devices.Count;
    });

    public Task<bool> LoadProfileAsync(string name) => With(async c =>
    {
        if (!(await c.ProfilesAsync()).Contains(name)) throw new RpcException("not-found", "Profil nicht gefunden.");
        await c.LoadProfileAsync(name);
        return true;
    });
}
