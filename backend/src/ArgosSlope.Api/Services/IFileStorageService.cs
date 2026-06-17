using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;

namespace ArgosSlope.Api.Services;

public interface IFileStorageService
{
    Task<string> SaveImageBase64Async(string base64Image, string folder, string filenamePrefix);
}

public class LocalFileStorageService : IFileStorageService
{
    private readonly IWebHostEnvironment _env;
    private readonly string _storagePath;
    private readonly string _baseUrl;

    public LocalFileStorageService(IWebHostEnvironment env, IConfiguration configuration)
    {
        _env = env;
        _storagePath = configuration["Storage:Path"] ?? Path.Combine(_env.WebRootPath ?? _env.ContentRootPath, "uploads");
        _baseUrl = configuration["Storage:BaseUrl"] ?? "/uploads";
        
        if (!Directory.Exists(_storagePath))
        {
            Directory.CreateDirectory(_storagePath);
        }
    }

    public async Task<string> SaveImageBase64Async(string base64Image, string folder, string filenamePrefix)
    {
        if (string.IsNullOrEmpty(base64Image))
            return string.Empty;

        // Limpiar el prefijo data:image/jpeg;base64, si existe
        if (base64Image.Contains(","))
        {
            base64Image = base64Image.Substring(base64Image.IndexOf(",") + 1);
        }

        var folderPath = Path.Combine(_storagePath, folder);
        if (!Directory.Exists(folderPath))
        {
            Directory.CreateDirectory(folderPath);
        }

        var filename = $"{filenamePrefix}_{DateTime.UtcNow:yyyyMMdd_HHmmss_fff}.jpg";
        var filePath = Path.Combine(folderPath, filename);

        var bytes = Convert.FromBase64String(base64Image);
        await File.WriteAllBytesAsync(filePath, bytes);

        return $"{_baseUrl}/{folder}/{filename}";
    }
}
