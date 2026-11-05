using System.Security.Cryptography;
using System.Text;

namespace Pgl.Core.Security;

/// <summary>
/// A secret (an API key typed on the phone) that travels sealed with the device key – so it is unreadable and unforgeable on the way even over
/// plain http in the home network. Both sides know the device key (SHA-256 of the pairing token, never sent) and the nonce of this connection:
/// the sealed message only opens in this very session, for this very purpose. Encrypt-then-MAC with HMAC-SHA256 (keystream = HMAC(encKey, iv ‖ counter),
/// tag = HMAC(macKey, purpose ‖ 0 ‖ iv ‖ ciphertext)) – the same few lines exist in the web app (lib/seal.ts), checked against each other by a test vector.
/// </summary>
public static class SecretSeal
{
    public const int MaxLength = 400;

    static byte[] Concat(params byte[][] parts) { using var m = new MemoryStream(); foreach (var p in parts) m.Write(p); return m.ToArray(); }
    static byte[] Derive(byte[] deviceKey, string label, byte[] nonce) => HMACSHA256.HashData(deviceKey, Concat(Encoding.UTF8.GetBytes(label + "|"), nonce));
    static byte[] Be32(int i) => new[] { (byte)(i >> 24), (byte)(i >> 16), (byte)(i >> 8), (byte)i };

    static byte[] Stream(byte[] encKey, byte[] iv, byte[] data)
    {
        var o = new byte[data.Length];
        for (int block = 0, pos = 0; pos < data.Length; block++)
        {
            var ks = HMACSHA256.HashData(encKey, Concat(iv, Be32(block)));
            for (var j = 0; j < ks.Length && pos < data.Length; j++, pos++) o[pos] = (byte)(data[pos] ^ ks[j]);
        }
        return o;
    }

    static byte[] Tag(byte[] macKey, string purpose, byte[] iv, byte[] ct) => HMACSHA256.HashData(macKey, Concat(Encoding.UTF8.GetBytes(purpose), new byte[] { 0 }, iv, ct));

    public static (string iv, string ct, string tag) Seal(byte[] deviceKey, byte[] nonce, string purpose, string plaintext, byte[]? iv = null)
    {
        iv ??= RandomNumberGenerator.GetBytes(16);
        var data = Encoding.UTF8.GetBytes(plaintext);
        var ct = Stream(Derive(deviceKey, "pgl-seal-enc", nonce), iv, data);
        var tag = Tag(Derive(deviceKey, "pgl-seal-mac", nonce), purpose, iv, ct);
        return (Convert.ToHexString(iv).ToLowerInvariant(), Convert.ToHexString(ct).ToLowerInvariant(), Convert.ToHexString(tag).ToLowerInvariant());
    }

    /// <summary>The secret, or null if anything does not match (wrong device, other session, other purpose, changed bytes).</summary>
    public static string? Open(byte[] deviceKey, byte[] nonce, string purpose, string ivHex, string ctHex, string tagHex)
    {
        try
        {
            if (ivHex.Length != 32 || ctHex.Length is 0 or > MaxLength * 2 || tagHex.Length != 64) return null;
            var iv = Convert.FromHexString(ivHex); var ct = Convert.FromHexString(ctHex); var tag = Convert.FromHexString(tagHex);
            var expected = Tag(Derive(deviceKey, "pgl-seal-mac", nonce), purpose, iv, ct);
            if (!CryptographicOperations.FixedTimeEquals(expected, tag)) return null;
            return Encoding.UTF8.GetString(Stream(Derive(deviceKey, "pgl-seal-enc", nonce), iv, ct));
        }
        catch (FormatException) { return null; }
    }
}
