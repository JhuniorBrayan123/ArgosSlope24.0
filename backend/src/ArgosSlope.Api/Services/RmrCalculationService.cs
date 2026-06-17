using System;
using System.Linq;
using ArgosSlope.Api.Models.Dtos;

namespace ArgosSlope.Api.Services;

public class RmrCalculationService
{
    public RmrCalculationResponse CalculateRmr(RmrCalculationRequest request)
    {
        if (request.Parameters == null || !request.Parameters.Any())
        {
            throw new ArgumentException("Se requieren parámetros para calcular el RMR.");
        }

        // Simplemente sumar todos los scores, incluyendo negativos
        int totalScore = request.Parameters.Sum(p => p.Score);
        
        totalScore = Math.Max(0, Math.Min(100, totalScore));

        var classification = ClassifyRmr(totalScore);

        return new RmrCalculationResponse
        {
            Value = totalScore,
            Class = classification.ClassName,
            Quality = classification.Quality
        };
    }

    private (string ClassName, string Quality) ClassifyRmr(int rmr)
    {
        if (rmr >= 81) return ("I", "Muy buena");
        if (rmr >= 61) return ("II", "Buena");
        if (rmr >= 41) return ("III", "Regular");
        if (rmr >= 21) return ("IV", "Mala");
        return ("V", "Muy mala");
    }
}
