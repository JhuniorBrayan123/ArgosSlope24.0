using ArgosSlope.Api.Models.Dtos;

namespace ArgosSlope.Api.Services;

public interface IAuthService
{
    Task<LoginResponse?> LoginAsync(LoginRequest request, string? ipAddress, string? userAgent);
    Task<LoginResponse?> RefreshAsync(string refreshToken, string? ipAddress, string? userAgent);
    Task RevokeTokenAsync(string refreshToken);
    Task<UserDto?> GetMeAsync(Guid userId);
    Task<bool> RegisterAsync(RegisterRequest request);
    Task<string?> RecoverPasswordAsync(RecoverPasswordRequest request);
}
