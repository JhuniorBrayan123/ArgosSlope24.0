using ArgosSlope.Api.Models.Dtos;
using ArgosSlope.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace ArgosSlope.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IAuthService _authService;

    public AuthController(IAuthService authService)
    {
        _authService = authService;
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request)
    {
        var ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString();
        var userAgent = Request.Headers.UserAgent.ToString();

        var response = await _authService.LoginAsync(request, ipAddress, userAgent);

        if (response == null)
        {
            return Unauthorized(new { message = "Credenciales inválidas o usuario inactivo." });
        }

        return Ok(response);
    }

    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh([FromBody] RefreshRequest request)
    {
        var ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString();
        var userAgent = Request.Headers.UserAgent.ToString();

        var response = await _authService.RefreshAsync(request.RefreshToken, ipAddress, userAgent);

        if (response == null)
        {
            return Unauthorized(new { message = "Sesión inválida o expirada." });
        }

        return Ok(response);
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout([FromBody] RefreshRequest request)
    {
        await _authService.RevokeTokenAsync(request.RefreshToken);
        return Ok(new { message = "Sesión cerrada correctamente." });
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request)
    {
        try
        {
            var success = await _authService.RegisterAsync(request);
            if (!success)
            {
                return BadRequest(new { message = "El correo ya está registrado." });
            }
            return Ok(new { message = "Usuario registrado exitosamente." });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Error interno del servidor.", detail = ex.Message });
        }
    }

    [HttpPost("recover")]
    public async Task<IActionResult> Recover([FromBody] RecoverPasswordRequest request)
    {
        try
        {
            var tempPassword = await _authService.RecoverPasswordAsync(request);
            if (string.IsNullOrEmpty(tempPassword))
            {
                return NotFound(new { message = "Correo no encontrado o usuario inactivo." });
            }
            return Ok(new { message = "Contraseña temporal generada.", tempPassword = tempPassword });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { message = "Error interno del servidor.", detail = ex.Message });
        }
    }

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> GetMe()
    {
        var userIdStr = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(userIdStr) || !Guid.TryParse(userIdStr, out var userId))
        {
            return Unauthorized();
        }

        var user = await _authService.GetMeAsync(userId);
        if (user == null)
        {
            return NotFound(new { message = "Usuario no encontrado." });
        }

        return Ok(user);
    }
}
