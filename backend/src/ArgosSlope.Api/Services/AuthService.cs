using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using ArgosSlope.Api.Data;
using ArgosSlope.Api.Models;
using ArgosSlope.Api.Models.Dtos;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace ArgosSlope.Api.Services;

public class AuthService : IAuthService
{
    private readonly AppDbContext _db;
    private readonly IConfiguration _config;

    public AuthService(AppDbContext db, IConfiguration config)
    {
        _db = db;
        _config = config;
    }

    public async Task<LoginResponse?> LoginAsync(LoginRequest request, string? ipAddress, string? userAgent)
    {
        var user = await _db.Users
            .Include(u => u.Role)
            .FirstOrDefaultAsync(u => u.Email == request.Email && u.IsActive);

        if (user == null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
        {
            await LogAuditAsync(user?.Id, request.Email, false, "Invalid credentials", ipAddress, userAgent);
            return null;
        }

        user.LastLoginAt = DateTime.UtcNow;
        await LogAuditAsync(user.Id, request.Email, true, null, ipAddress, userAgent);

        return await GenerateTokensAsync(user, request.RememberMe, ipAddress, userAgent);
    }

    public async Task<LoginResponse?> RefreshAsync(string refreshToken, string? ipAddress, string? userAgent)
    {
        var tokenHash = HashToken(refreshToken);
        var session = await _db.UserSessions
            .Include(s => s.User)
            .ThenInclude(u => u!.Role)
            .FirstOrDefaultAsync(s => s.TokenHash == tokenHash && s.ExpiresAt > DateTime.UtcNow && s.RevokedAt == null);

        if (session == null || session.User == null || !session.User.IsActive)
            return null;

        // Revoke the old token
        session.RevokedAt = DateTime.UtcNow;

        return await GenerateTokensAsync(session.User, true, ipAddress, userAgent);
    }

    public async Task RevokeTokenAsync(string refreshToken)
    {
        var tokenHash = HashToken(refreshToken);
        var session = await _db.UserSessions.FirstOrDefaultAsync(s => s.TokenHash == tokenHash);
        if (session != null)
        {
            session.RevokedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
        }
    }

    public async Task<UserDto?> GetMeAsync(Guid userId)
    {
        var user = await _db.Users
            .Include(u => u.Role)
            .FirstOrDefaultAsync(u => u.Id == userId && u.IsActive);

        if (user == null) return null;

        return new UserDto
        {
            Id = user.Id,
            FullName = user.FullName,
            Email = user.Email,
            Role = user.Role?.Name ?? "",
            LastLoginAt = user.LastLoginAt
        };
    }

    public async Task<bool> RegisterAsync(RegisterRequest request)
    {
        if (await _db.Users.AnyAsync(u => u.Email == request.Email))
        {
            return false;
        }

        var operatorRole = await _db.Roles.FirstOrDefaultAsync(r => r.Name == "Operador");
        if (operatorRole == null)
        {
            throw new Exception("Role 'Operador' not found in database.");
        }

        var user = new AppUser
        {
            Email = request.Email,
            FullName = request.FullName,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            RoleId = operatorRole.Id
        };

        _db.Users.Add(user);
        await _db.SaveChangesAsync();

        return true;
    }

    public async Task<string?> RecoverPasswordAsync(RecoverPasswordRequest request)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == request.Email && u.IsActive);
        if (user == null)
        {
            return null;
        }

        // Generate temporary password
        var tempPassword = "Tmp" + Guid.NewGuid().ToString().Substring(0, 6).ToUpper() + "!";
        
        user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(tempPassword);
        user.UpdatedAt = DateTime.UtcNow;
        
        await _db.SaveChangesAsync();

        return tempPassword;
    }

    private async Task<LoginResponse> GenerateTokensAsync(AppUser user, bool rememberMe, string? ip, string? ua)
    {
        var jwtSecret = _config["Jwt:Secret"] ?? throw new InvalidOperationException("JWT Secret not configured");
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, user.Email),
            new Claim(ClaimTypes.Role, user.Role?.Name ?? "Operador"),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        var expiryHours = _config.GetValue<double>("Jwt:ExpiryHours", 8);
        var accessExpiry = DateTime.UtcNow.AddHours(expiryHours);

        var token = new JwtSecurityToken(
            issuer: _config["Jwt:Issuer"],
            audience: _config["Jwt:Audience"],
            claims: claims,
            expires: accessExpiry,
            signingCredentials: creds
        );

        var accessToken = new JwtSecurityTokenHandler().WriteToken(token);
        
        var refreshToken = GenerateRefreshToken();
        var session = new UserSession
        {
            UserId = user.Id,
            TokenHash = HashToken(refreshToken),
            ExpiresAt = DateTime.UtcNow.AddDays(rememberMe ? 30 : 1), // 1 day if not remember me, 30 if yes
            IpAddress = ip,
            UserAgent = ua
        };

        _db.UserSessions.Add(session);
        await _db.SaveChangesAsync();

        return new LoginResponse
        {
            AccessToken = accessToken,
            RefreshToken = refreshToken,
            ExpiresAt = accessExpiry,
            User = new UserDto
            {
                Id = user.Id,
                FullName = user.FullName,
                Email = user.Email,
                Role = user.Role?.Name ?? "",
                LastLoginAt = user.LastLoginAt
            }
        };
    }

    private string GenerateRefreshToken()
    {
        var randomBytes = new byte[64];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(randomBytes);
        return Convert.ToBase64String(randomBytes);
    }

    private string HashToken(string token)
    {
        using var sha256 = SHA256.Create();
        var hash = sha256.ComputeHash(Encoding.UTF8.GetBytes(token));
        return Convert.ToBase64String(hash);
    }

    private async Task LogAuditAsync(Guid? userId, string email, bool success, string? reason, string? ip, string? ua)
    {
        _db.LoginAudits.Add(new LoginAudit
        {
            UserId = userId,
            EmailAttempted = email,
            Success = success,
            FailureReason = reason,
            IpAddress = ip,
            UserAgent = ua
        });
        await _db.SaveChangesAsync();
    }
}
