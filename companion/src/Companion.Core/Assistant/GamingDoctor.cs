using System.Globalization;
using Pgl.Core.Platform;

namespace Pgl.Core.Assistant;

/// <summary>
/// "Warum ruckelt mein Spiel?" – one measurement of this PC, judged with fixed thresholds. Only what the PC really
/// measures (load, memory, temperatures, free space); frame rates are not measured, so nothing is said about FPS.
/// </summary>
public static class GamingDoctor
{
    static readonly CultureInfo De = new("de-DE");
    const double GB = 1073741824.0;

    public sealed record Finding(string Text, bool Problem);

    public static List<Finding> Check(MetricsSample m, bool gameRunning)
    {
        static string F(FormattableString f) => f.ToString(De);
        var list = new List<Finding>();
        if (m.CpuPercent is { } cpu && cpu >= 90) list.Add(new(F($"Prozessor am Limit ({cpu:0} %): Programme im Hintergrund schließen (Spielmodus), beim Notebook das Netzteil anschließen und den Energiemodus „Beste Leistung“ wählen. Niedrigere Grafik hilft hier wenig."), true));
        if (m.MemTotalBytes is { } mt && m.MemUsedBytes is { } mu && mt > 0 && mu >= 0.9 * mt) list.Add(new(F($"Arbeitsspeicher fast voll ({mu / GB:0.0} von {mt / GB:0.0} GB): Browser und andere Programme schließen."), true));
        if (m.CpuTempC is { } ct && ct >= 95) list.Add(new(F($"Prozessor sehr heiß ({ct:0} °C) – er bremst sich dann selbst. Lüftungsschlitze frei halten, Notebook erhöht aufstellen."), true));
        foreach (var g in m.Gpus)
        {
            var name = string.IsNullOrWhiteSpace(g.Name) ? "Grafikkarte" : g.Name;
            if (g.TempC is { } gt && gt >= 87) list.Add(new(F($"{name} sehr heiß ({gt:0} °C) – sie taktet herunter. Kühlung prüfen, Notebook erhöht aufstellen."), true));
            if (g.MemUsedBytes is { } vu && g.MemTotalBytes is { } vt && vt > 0 && vu >= 0.92 * vt) list.Add(new(F($"Grafikspeicher fast voll ({vu / GB:0.0} von {vt / GB:0.0} GB): Texturqualität oder Auflösung senken."), true));
            if (gameRunning && g.UtilPercent is { } u)
            {
                if (u >= 97) list.Add(new(F($"{name} voll ausgelastet ({u:0} %) – das Spiel nutzt sie ganz. Für mehr Bilder pro Sekunde Details senken oder DLSS einschalten."), true));
                else if (u < 50 && (m.CpuPercent ?? 0) < 70 && name.Contains("NVIDIA", StringComparison.OrdinalIgnoreCase))
                    list.Add(new(F($"{name} kaum ausgelastet ({u:0} %), obwohl ein Spiel läuft: Läuft das Spiel auf der NVIDIA-Karte? (Windows → Grafikeinstellungen → Spiel → „Hohe Leistung“.) Auch ein FPS-Limit oder V-Sync kann das sein."), true));
            }
        }
        foreach (var d in m.Disks)
            if (d.TotalBytes > 0 && d.FreeBytes < 0.07 * d.TotalBytes) list.Add(new(F($"Laufwerk {d.Name} fast voll ({d.FreeBytes / GB:0} GB frei) – Spiele laden dann langsamer und Windows kann ruckeln."), true));
        if (!gameRunning) list.Add(new("Gerade läuft kein Spiel – frag am besten, während es ruckelt, dann sehe ich die Werte unter Last.", false));
        else if (list.Count == 0) list.Add(new("Bei Last, Speicher und Temperatur sehe ich keine Engstelle. Bilder pro Sekunde misst der PC nicht – weitere Ursachen sind Netzwerk (Ping), Shader-Aufbau nach einem Update oder ein alter Grafiktreiber.", false));
        return list;
    }
}
