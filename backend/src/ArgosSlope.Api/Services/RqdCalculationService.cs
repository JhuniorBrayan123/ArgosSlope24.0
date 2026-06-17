using System;
using System.Linq;
using ArgosSlope.Api.Models.Dtos;

namespace ArgosSlope.Api.Services;

public class RqdCalculationService
{
    public RqdCalculationResponse CalculateHudson(HudsonCalculationRequest request)
    {
        if (request.JointFamilies == null || !request.JointFamilies.Any())
        {
            throw new ArgumentException("Se requiere al menos una familia de discontinuidades.");
        }

        double jv = 0;
        foreach (var family in request.JointFamilies)
        {
            if (family.SpacingM <= 0)
            {
                throw new ArgumentException($"El espaciamiento para la familia {family.FamilyName} debe ser mayor a 0.");
            }
            jv += 1.0 / family.SpacingM;
        }

        double rqd = 115 - 3.3 * jv;
        rqd = Math.Max(0, Math.Min(100, rqd)); // Limitar entre 0 y 100

        return new RqdCalculationResponse
        {
            Method = "hudson",
            Jv = Math.Round(jv, 2),
            Value = Math.Round(rqd, 2),
            Quality = ClassifyRqd(rqd)
        };
    }

    public RqdCalculationResponse CalculatePalmstrom(PalmstromCalculationRequest request)
    {
        if (request.LineLengthM <= 0)
        {
            throw new ArgumentException("La longitud de línea debe ser mayor a 0.");
        }
        if (request.DiscontinuityCount < 0)
        {
            throw new ArgumentException("El número de discontinuidades no puede ser negativo.");
        }

        double lambda = request.DiscontinuityCount / request.LineLengthM;
        double rqd = 100 * Math.Exp(-0.1 * lambda) * (0.1 * lambda + 1);
        
        rqd = Math.Max(0, Math.Min(100, rqd)); // Limitar entre 0 y 100

        return new RqdCalculationResponse
        {
            Method = "palmstrom",
            LambdaValue = Math.Round(lambda, 2),
            Value = Math.Round(rqd, 2),
            Quality = ClassifyRqd(rqd)
        };
    }

    private string ClassifyRqd(double rqd)
    {
        if (rqd < 25) return "Muy pobre";
        if (rqd < 50) return "Pobre";
        if (rqd < 75) return "Regular";
        if (rqd < 90) return "Buena";
        return "Muy buena";
    }
}
