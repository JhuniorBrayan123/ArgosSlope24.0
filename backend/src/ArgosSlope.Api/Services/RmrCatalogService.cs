using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using ArgosSlope.Api.Data;
using ArgosSlope.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace ArgosSlope.Api.Services;

public class RmrCatalogService
{
    private readonly AppDbContext _dbContext;

    public RmrCatalogService(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<Dictionary<string, List<RmrCatalogOption>>> GetCatalogAsync()
    {
        var options = await _dbContext.RmrCatalogOptions.ToListAsync();

        if (!options.Any())
        {
            await SeedCatalogAsync();
            options = await _dbContext.RmrCatalogOptions.ToListAsync();
        }

        return options
            .GroupBy(o => o.ParameterKey)
            .ToDictionary(g => g.Key, g => g.ToList());
    }

    private async Task SeedCatalogAsync()
    {
        var catalog = new List<RmrCatalogOption>
        {
            // Resistencia a la compresión
            new() { ParameterKey = "compressive_strength", Code = "cs_1", Label = "> 250 MPa", Score = 15 },
            new() { ParameterKey = "compressive_strength", Code = "cs_2", Label = "100 - 250 MPa", Score = 12 },
            new() { ParameterKey = "compressive_strength", Code = "cs_3", Label = "50 - 100 MPa", Score = 7 },
            new() { ParameterKey = "compressive_strength", Code = "cs_4", Label = "25 - 50 MPa", Score = 4 },
            new() { ParameterKey = "compressive_strength", Code = "cs_5", Label = "< 25 MPa", Score = 2 },

            // RQD
            new() { ParameterKey = "rqd", Code = "rqd_1", Label = "90% - 100%", Score = 20, MinValue = 90, MaxValue = 100 },
            new() { ParameterKey = "rqd", Code = "rqd_2", Label = "75% - 90%", Score = 17, MinValue = 75, MaxValue = 90 },
            new() { ParameterKey = "rqd", Code = "rqd_3", Label = "50% - 75%", Score = 13, MinValue = 50, MaxValue = 75 },
            new() { ParameterKey = "rqd", Code = "rqd_4", Label = "25% - 50%", Score = 8, MinValue = 25, MaxValue = 50 },
            new() { ParameterKey = "rqd", Code = "rqd_5", Label = "< 25%", Score = 3, MinValue = 0, MaxValue = 25 },

            // Espaciamiento
            new() { ParameterKey = "discontinuity_spacing", Code = "spacing_1", Label = "> 2 m", Score = 20 },
            new() { ParameterKey = "discontinuity_spacing", Code = "spacing_2", Label = "0.6 - 2 m", Score = 15 },
            new() { ParameterKey = "discontinuity_spacing", Code = "spacing_3", Label = "200 - 600 mm", Score = 10 },
            new() { ParameterKey = "discontinuity_spacing", Code = "spacing_4", Label = "60 - 200 mm", Score = 8 },
            new() { ParameterKey = "discontinuity_spacing", Code = "spacing_5", Label = "< 60 mm", Score = 5 },

            // Persistencia
            new() { ParameterKey = "persistence", Code = "persistence_1", Label = "< 1 m", Score = 6 },
            new() { ParameterKey = "persistence", Code = "persistence_2", Label = "1 - 3 m", Score = 4 },
            new() { ParameterKey = "persistence", Code = "persistence_3", Label = "3 - 10 m", Score = 2 },
            new() { ParameterKey = "persistence", Code = "persistence_4", Label = "10 - 20 m", Score = 1 },
            new() { ParameterKey = "persistence", Code = "persistence_5", Label = "> 20 m", Score = 0 },

            // Apertura
            new() { ParameterKey = "aperture", Code = "aperture_1", Label = "Cerrada", Score = 6 },
            new() { ParameterKey = "aperture", Code = "aperture_2", Label = "Muy angosta < 0.1 mm", Score = 5 },
            new() { ParameterKey = "aperture", Code = "aperture_3", Label = "Angosta 0.1 - 1.0 mm", Score = 4 },
            new() { ParameterKey = "aperture", Code = "aperture_4", Label = "Abierta 1.0 - 5.0 mm", Score = 1 },
            new() { ParameterKey = "aperture", Code = "aperture_5", Label = "Muy abierta > 5.0 mm", Score = 0 },

            // Rugosidad
            new() { ParameterKey = "roughness", Code = "roughness_1", Label = "Muy rugoso", Score = 6 },
            new() { ParameterKey = "roughness", Code = "roughness_2", Label = "Rugoso", Score = 5 },
            new() { ParameterKey = "roughness", Code = "roughness_3", Label = "Ligeramente rugosa", Score = 3 },
            new() { ParameterKey = "roughness", Code = "roughness_4", Label = "Lisa", Score = 1 },
            new() { ParameterKey = "roughness", Code = "roughness_5", Label = "Muy lisa", Score = 0 },

            // Relleno
            new() { ParameterKey = "infilling", Code = "infilling_1", Label = "Ninguno", Score = 6 },
            new() { ParameterKey = "infilling", Code = "infilling_2", Label = "Relleno duro < 5 mm", Score = 4 },
            new() { ParameterKey = "infilling", Code = "infilling_3", Label = "Relleno duro > 5 mm", Score = 2 },
            new() { ParameterKey = "infilling", Code = "infilling_4", Label = "Relleno blando < 5 mm", Score = 1 },
            new() { ParameterKey = "infilling", Code = "infilling_5", Label = "Relleno blando > 5 mm", Score = 0 },

            // Alteración
            new() { ParameterKey = "weathering", Code = "weathering_1", Label = "No meteorizada", Score = 6 },
            new() { ParameterKey = "weathering", Code = "weathering_2", Label = "Ligeramente", Score = 5 },
            new() { ParameterKey = "weathering", Code = "weathering_3", Label = "Moderadamente", Score = 3 },
            new() { ParameterKey = "weathering", Code = "weathering_4", Label = "Altamente meteorizada", Score = 1 },
            new() { ParameterKey = "weathering", Code = "weathering_5", Label = "Descompuesta", Score = 0 },

            // Agua subterránea
            new() { ParameterKey = "groundwater", Code = "groundwater_1", Label = "Completamente seco", Score = 15 },
            new() { ParameterKey = "groundwater", Code = "groundwater_2", Label = "Húmedo", Score = 10 },
            new() { ParameterKey = "groundwater", Code = "groundwater_3", Label = "Mojado", Score = 7 },
            new() { ParameterKey = "groundwater", Code = "groundwater_4", Label = "Goteo", Score = 4 },
            new() { ParameterKey = "groundwater", Code = "groundwater_5", Label = "Flujo", Score = 0 },

            // Orientación
            new() { ParameterKey = "discontinuity_orientation", Code = "orientation_1", Label = "Muy favorable", Score = 0 },
            new() { ParameterKey = "discontinuity_orientation", Code = "orientation_2", Label = "Favorable", Score = -2 },
            new() { ParameterKey = "discontinuity_orientation", Code = "orientation_3", Label = "Regular", Score = -5 },
            new() { ParameterKey = "discontinuity_orientation", Code = "orientation_4", Label = "Desfavorable", Score = -10 },
            new() { ParameterKey = "discontinuity_orientation", Code = "orientation_5", Label = "Muy desfavorable", Score = -12 }
        };

        _dbContext.RmrCatalogOptions.AddRange(catalog);
        await _dbContext.SaveChangesAsync();
    }
}
