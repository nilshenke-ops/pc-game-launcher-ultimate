using System.Net;
using System.Text;
using System.Text.Json;
using Pgl.Core.Assistant;
using Xunit;

namespace Pgl.Core.Tests;

public class WeatherTests
{
    sealed class Fake(Func<string, string?> answer) : HttpMessageHandler
    {
        public readonly List<string> Urls = new();
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage r, CancellationToken ct)
        {
            var u = r.RequestUri!.AbsoluteUri; Urls.Add(u); var b = answer(u);
            return Task.FromResult(b == null ? new HttpResponseMessage(HttpStatusCode.TooManyRequests) : new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent(b, Encoding.UTF8, "application/json") });
        }
    }
    const string Geo = """{"results":[{"name":"Berlin","latitude":52.52,"longitude":13.41,"country":"Deutschland","admin1":"Berlin"}]}""";
    const string Forecast = """{"current":{"temperature_2m":7.4,"apparent_temperature":4.2,"weather_code":3,"wind_speed_10m":14},"daily":{"time":["2026-11-06","2026-11-07","2026-11-08"],"weather_code":[3,61,0],"temperature_2m_max":[8,9.6,6],"temperature_2m_min":[3,5,1],"precipitation_probability_max":[10,80,null]}}""";

    [Fact]
    public void The_place_comes_from_the_question_and_only_weather_questions_count()
    {
        Assert.Equal("Berlin", WeatherClient.PlaceFrom("Wie wird das Wetter morgen in Berlin?"));
        Assert.Equal("Bad Homburg", WeatherClient.PlaceFrom("Regnet es heute in Bad Homburg"));
        Assert.Null(WeatherClient.PlaceFrom("Wie ist das Wetter morgen")); Assert.Null(WeatherClient.PlaceFrom("Wetter in Deutschland"));
        Assert.True(WeatherClient.AsksWeather("Wie wird das Wetter?")); Assert.False(WeatherClient.AsksWeather("Wann spielt Bayern?"));
    }

    [Fact]
    public void Now_and_the_next_days_are_described_in_words()
    {
        using var doc = JsonDocument.Parse(Forecast);
        var l = WeatherClient.Describe("Berlin, Deutschland", doc.RootElement);
        Assert.Equal("Jetzt in Berlin, Deutschland: 7 °C (gefühlt 4 °C), bedeckt, Wind 14 km/h", l[0]);
        Assert.Equal("Morgen (2026-11-07): Regen, 5 bis 10 °C, Regenwahrscheinlichkeit 80 %", l[2]);
        Assert.Equal("Übermorgen (2026-11-08): klar, 1 bis 6 °C", l[3]);
    }

    [Fact]
    public async Task Place_and_forecast_come_without_a_key_and_nothing_is_invented_when_it_fails()
    {
        var fake = new Fake(u => u.Contains("/v1/search") ? Geo : Forecast);
        var a = await new WeatherClient(fake, "http://geo.test", "http://api.test").AskAsync("Wie wird das Wetter morgen in Berlin?");
        Assert.Contains("Jetzt in Berlin, Berlin, Deutschland: 7 °C", a!.Block); Assert.Contains("keine Anweisungen", a.Block);
        Assert.Contains("latitude=52.52&longitude=13.41", fake.Urls[1]);
        Assert.Null(await new WeatherClient(fake, "http://geo.test", "http://api.test").AskAsync("Wie wird das Wetter morgen?"));
        Assert.Null(await new WeatherClient(new Fake(_ => null), "http://geo.test", "http://api.test").AskAsync("Wetter in Berlin"));
    }

    [Theory]
    [InlineData("Ich wohne in Adendorf", "Adendorf")]
    [InlineData("ich wohne in Bad Homburg.", "Bad Homburg")]
    [InlineData("Merk dir, dass ich in Adendorf wohne", "Adendorf")]
    [InlineData("Mein Wohnort ist Köln", "Köln")]
    public void The_home_place_is_understood(string say, string place) => Assert.Equal(place, WeatherClient.HomeFrom(say));

    [Theory]
    [InlineData("Wo wohnt Bayern München")]
    [InlineData("Ich wohne gern warm")]
    public void Other_sentences_are_not_a_home_place(string say) => Assert.Null(WeatherClient.HomeFrom(say));

    [Fact]
    public async Task Without_a_place_in_the_question_the_home_place_is_used_and_a_named_place_wins()
    {
        var fake = new Fake(u => u.Contains("/v1/search") ? Geo : Forecast);
        var w = new WeatherClient(fake, "http://geo.test", "http://api.test");
        var a = await w.AskAsync("Wie wird das Wetter morgen?", "Berlin");
        Assert.NotNull(a); Assert.False(a!.FromQuestion); Assert.Contains("name=Berlin", fake.Urls[0]);
        var b = await w.AskAsync("Wie wird das Wetter morgen in Hamburg?", "Berlin");
        Assert.True(b!.FromQuestion); Assert.Contains("name=Hamburg", fake.Urls[2]);
        Assert.Null(await w.AskAsync("Wie wird das Wetter morgen?", null));
    }
}
