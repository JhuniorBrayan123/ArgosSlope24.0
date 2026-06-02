using Microsoft.EntityFrameworkCore;
using ArgosSlope.Api.Data;
using ArgosSlope.Api.Models;

namespace ArgosSlope.Api.Services;

/// <summary>
/// Repositorio CRUD para Fisuras con proyecciones a DTOs.
/// </summary>
public interface IFisuraRepository
{
    Task<List<Fisura>> GetAllAsync();
    Task<Fisura?> GetByIdAsync(int id);
    Task<List<MedicionDiaria>> GetMedicionesAsync(int fisuraId, int? dias = null);
    Task<List<Alerta>> GetAlertasAsync(bool soloNoReconocidas = false);
    Task<Alerta?> ReconocerAlertaAsync(int alertaId);
    Task<List<Configuracion>> GetConfiguracionAsync();
    Task<Configuracion> UpsertConfiguracionAsync(string clave, string valor);
    Task<Dictionary<string, int>> GetResumenAsync();
}

public class FisuraRepository : IFisuraRepository
{
    private readonly AppDbContext _db;

    public FisuraRepository(AppDbContext db)
    {
        _db = db;
    }

    public async Task<List<Fisura>> GetAllAsync()
    {
        return await _db.Fisuras
            .OrderByDescending(f => f.FechaDeteccion)
            .ToListAsync();
    }

    public async Task<Fisura?> GetByIdAsync(int id)
    {
        return await _db.Fisuras.FindAsync(id);
    }

    public async Task<List<MedicionDiaria>> GetMedicionesAsync(int fisuraId, int? dias = null)
    {
        var query = _db.MedicionesDiarias
            .Where(m => m.FisuraId == fisuraId)
            .OrderBy(m => m.Fecha);

        if (dias.HasValue && dias.Value > 0)
        {
            var cutoff = DateTime.UtcNow.AddDays(-dias.Value);
            query = (IOrderedQueryable<MedicionDiaria>)query.Where(m => m.Fecha >= cutoff);
        }

        return await query.ToListAsync();
    }

    public async Task<List<Alerta>> GetAlertasAsync(bool soloNoReconocidas = false)
    {
        var query = _db.Alertas.AsQueryable();

        if (soloNoReconocidas)
            query = query.Where(a => !a.Reconocida);

        return await query
            .OrderByDescending(a => a.Fecha)
            .ToListAsync();
    }

    public async Task<Alerta?> ReconocerAlertaAsync(int alertaId)
    {
        var alerta = await _db.Alertas.FindAsync(alertaId);
        if (alerta is null) return null;

        alerta.Reconocida = true;
        await _db.SaveChangesAsync();
        return alerta;
    }

    public async Task<List<Configuracion>> GetConfiguracionAsync()
    {
        return await _db.Configuraciones.ToListAsync();
    }

    public async Task<Configuracion> UpsertConfiguracionAsync(string clave, string valor)
    {
        var entry = await _db.Configuraciones
            .FirstOrDefaultAsync(c => c.Clave == clave);

        if (entry is not null)
        {
            entry.Valor = valor;
        }
        else
        {
            entry = new Configuracion { Clave = clave, Valor = valor };
            _db.Configuraciones.Add(entry);
        }

        await _db.SaveChangesAsync();
        return entry;
    }

    public async Task<Dictionary<string, int>> GetResumenAsync()
    {
        var totalFisuras = await _db.Fisuras.CountAsync();
        var alertasCriticas = await _db.Alertas
            .CountAsync(a => a.Tipo == "critico" && !a.Reconocida);

        return new Dictionary<string, int>
        {
            ["total_fisuras"] = totalFisuras,
            ["alertas_criticas"] = alertasCriticas,
        };
    }
}
