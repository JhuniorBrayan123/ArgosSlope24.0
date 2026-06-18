using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ArgosSlope.Api.Data;
using ArgosSlope.Api.Models;
using System.Text.Json;

namespace ArgosSlope.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AnalyticsController : ControllerBase
{
    private readonly AppDbContext _context;

    public AnalyticsController(AppDbContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<IActionResult> GetAnalytics([FromQuery] string? period = "7d", [FromQuery] string? start = null, [FromQuery] string? end = null)
    {
        DateTime startDate = DateTime.UtcNow.Date.AddDays(-7);
        DateTime endDate = DateTime.UtcNow.Date.AddDays(1);

        if (!string.IsNullOrEmpty(start) && !string.IsNullOrEmpty(end))
        {
            if (DateTime.TryParse(start, out var sDate)) startDate = sDate.Date;
            if (DateTime.TryParse(end, out var eDate)) endDate = eDate.Date.AddDays(1);
        }
        else
        {
            switch (period?.ToLower())
            {
                case "30d": startDate = DateTime.UtcNow.Date.AddDays(-30); break;
                case "90d": startDate = DateTime.UtcNow.Date.AddDays(-90); break;
                case "1y": startDate = DateTime.UtcNow.Date.AddDays(-365); break;
                case "7d": default: startDate = DateTime.UtcNow.Date.AddDays(-7); break;
            }
        }

        startDate = DateTime.SpecifyKind(startDate, DateTimeKind.Utc);
        endDate = DateTime.SpecifyKind(endDate, DateTimeKind.Utc);

        var measurements = await _context.CrackMeasurements
            .Where(m => m.MeasuredAt >= startDate && m.MeasuredAt < endDate)
            .OrderBy(m => m.MeasuredAt)
            .Select(m => new { m.CrackId, m.MeasuredAt, m.WidthMm, m.GrowthPercent, m.LengthMm })
            .ToListAsync();

        var groupedByDate = measurements
            .GroupBy(m => m.MeasuredAt.ToString("yyyy-MM-dd"))
            .OrderBy(g => g.Key)
            .ToList();

        var result = new List<Dictionary<string, object>>();

        foreach (var group in groupedByDate)
        {
            var dict = new Dictionary<string, object>
            {
                { "fecha", group.Key }
            };

            foreach (var m in group)
            {
                dict[$"ancho_{m.CrackId}"] = m.WidthMm ?? 0;
                dict[$"delta_{m.CrackId}"] = m.GrowthPercent;
                dict[$"longitud_{m.CrackId}"] = m.LengthMm ?? 0;
            }

            result.Add(dict);
        }

        return Ok(result);
    }
}
