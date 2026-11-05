using System.Security.Cryptography;
using System.Text;
using Pgl.Core.Security;
using Xunit;

namespace Pgl.Core.Tests;

/// <summary>A key typed on a phone travels sealed with the device key (web: lib/seal.ts). The vector below is produced by the web code and must open here.</summary>
public class SecretSealTests
{
    static readonly byte[] DeviceKey = SHA256.HashData(Encoding.UTF8.GetBytes("tok-1234"));          // = SHA-256(pairing token), as the companion stores it
    static readonly byte[] Nonce = Convert.FromHexString("00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff");
    const string Purpose = "ai.key:openrouter", Secret = "sk-or-v1-0123456789abcdef0123456789";
    const string Iv = "000102030405060708090a0b0c0d0e0f", Ct = "b616db9badb93c8d5d9c75afcb248fa7dbf330af558aad61fb200f4f70aa0a007b94b2", Tag = "b852acc761a6b6311c7d3b9e31fce5fd89a51274b5622c6a04aa7b8ef52ed7f1";

    [Fact]
    public void Der_Testvektor_der_Webseite_wird_geoeffnet_und_Seal_erzeugt_dieselben_Bytes()
    {
        Assert.Equal(Secret, SecretSeal.Open(DeviceKey, Nonce, Purpose, Iv, Ct, Tag));
        var s = SecretSeal.Seal(DeviceKey, Nonce, Purpose, Secret, Convert.FromHexString(Iv));
        Assert.Equal((Iv, Ct, Tag), s);
    }

    [Fact]
    public void Nur_in_dieser_Sitzung_fuer_diesen_Zweck_mit_diesem_Geraeteschluessel_und_unveraendert()
    {
        Assert.Null(SecretSeal.Open(DeviceKey, Convert.FromHexString(new string('f', 64)), Purpose, Iv, Ct, Tag));        // another connection (replay)
        Assert.Null(SecretSeal.Open(DeviceKey, Nonce, "ai.key:groq", Iv, Ct, Tag));                                        // the OpenRouter key cannot be put into the Groq slot
        Assert.Null(SecretSeal.Open(SHA256.HashData(Encoding.UTF8.GetBytes("anderes Gerät")), Nonce, Purpose, Iv, Ct, Tag)); // another device
        var flipped = Ct[..^2] + (Ct.EndsWith("00") ? "01" : "00");
        Assert.Null(SecretSeal.Open(DeviceKey, Nonce, Purpose, Iv, flipped, Tag));                                          // changed on the way
        Assert.Null(SecretSeal.Open(DeviceKey, Nonce, Purpose, Iv, Ct, new string('0', 64)));
        Assert.Null(SecretSeal.Open(DeviceKey, Nonce, Purpose, "zz", "nicht-hex", "x"));                                    // garbage never throws
        Assert.Null(SecretSeal.Open(DeviceKey, Nonce, Purpose, Iv, "", Tag));
    }

    [Fact]
    public void Eigene_Versiegelung_laeuft_rund_und_der_Klartext_steht_nicht_im_Ergebnis()
    {
        var (iv, ct, tag) = SecretSeal.Seal(DeviceKey, Nonce, Purpose, "gsk_" + new string('a', 40));
        Assert.DoesNotContain("gsk_", iv + ct + tag);
        Assert.Equal("gsk_" + new string('a', 40), SecretSeal.Open(DeviceKey, Nonce, Purpose, iv, ct, tag));
    }
}
