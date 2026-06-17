using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using ArgosSlope.Api.Data;
using ArgosSlope.Api.Models;
using ArgosSlope.Api.Models.Dtos;
using Microsoft.EntityFrameworkCore;

namespace ArgosSlope.Api.Services;

public class GeomechanicalEvaluationService
{
    private readonly AppDbContext _dbContext;

    public GeomechanicalEvaluationService(AppDbContext dbContext)
    {
        _dbContext = dbContext;
    }

    public async Task<GeomechanicalEvaluation> SaveEvaluationAsync(GeomechanicalEvaluationRequest request)
    {
        var evaluation = new GeomechanicalEvaluation
        {
            ZoneId = request.ZoneId,
            MonitoringId = request.MonitoringId,
            ImageId = request.ImageId,
            Notes = request.Notes,
            CreatedBy = "system" // Se puede actualizar cuando se integre auth
        };

        if (request.Rqd != null)
        {
            evaluation.RqdMethod = request.Rqd.Method;
            evaluation.RqdValue = request.Rqd.Value;
            evaluation.RqdQuality = request.Rqd.Quality;

            evaluation.RqdCalculation = new RqdCalculation
            {
                Method = request.Rqd.Method,
                Jv = request.Rqd.Jv,
                LambdaValue = request.Rqd.LambdaValue,
                DiscontinuityCount = request.Rqd.DiscontinuityCount,
                LineLengthM = request.Rqd.LineLengthM,
                RqdValue = request.Rqd.Value,
                RqdQuality = request.Rqd.Quality,
                JointFamilies = request.Rqd.JointFamilies?.Select(f => new RqdJointFamily
                {
                    FamilyName = f.FamilyName,
                    SpacingM = f.SpacingM,
                    OrientationDeg = f.OrientationDeg,
                    Source = f.Source,
                    DetectedByOpenCv = f.DetectedByOpenCv
                }).ToList() ?? new List<RqdJointFamily>()
            };
        }

        if (request.Rmr != null)
        {
            evaluation.RmrValue = request.Rmr.Value;
            evaluation.RmrClass = request.Rmr.Class;
            evaluation.RmrQuality = request.Rmr.Quality;

            foreach (var p in request.Rmr.Parameters)
            {
                evaluation.RmrParameters.Add(new RmrParameter
                {
                    ParameterKey = p.ParameterKey,
                    SelectedCode = p.SelectedCode,
                    SelectedLabel = p.SelectedLabel,
                    Score = p.Score,
                    Source = p.Source,
                    IsAuto = p.IsAuto
                });
            }
        }

        _dbContext.GeomechanicalEvaluations.Add(evaluation);
        await _dbContext.SaveChangesAsync();

        return evaluation;
    }

    public async Task<List<GeomechanicalEvaluation>> GetEvaluationsAsync()
    {
        return await _dbContext.GeomechanicalEvaluations
            .Include(e => e.RqdCalculation)
                .ThenInclude(r => r.JointFamilies)
            .Include(e => e.RmrParameters)
            .OrderByDescending(e => e.CreatedAt)
            .ToListAsync();
    }

    public async Task<GeomechanicalEvaluation?> GetEvaluationByIdAsync(int id)
    {
        return await _dbContext.GeomechanicalEvaluations
            .Include(e => e.RqdCalculation)
                .ThenInclude(r => r.JointFamilies)
            .Include(e => e.RmrParameters)
            .FirstOrDefaultAsync(e => e.Id == id);
    }

    public async Task<List<GeomechanicalEvaluation>> GetEvaluationsByZoneAsync(string zoneId)
    {
        return await _dbContext.GeomechanicalEvaluations
            .Include(e => e.RqdCalculation)
                .ThenInclude(r => r.JointFamilies)
            .Include(e => e.RmrParameters)
            .Where(e => e.ZoneId == zoneId)
            .OrderByDescending(e => e.CreatedAt)
            .ToListAsync();
    }

    public async Task<List<GeomechanicalEvaluation>> GetEvaluationsByMonitoringAsync(string monitoringId)
    {
        return await _dbContext.GeomechanicalEvaluations
            .Include(e => e.RqdCalculation)
                .ThenInclude(r => r.JointFamilies)
            .Include(e => e.RmrParameters)
            .Where(e => e.MonitoringId == monitoringId)
            .OrderByDescending(e => e.CreatedAt)
            .ToListAsync();
    }
}
