using System.Collections.Generic;

namespace ArgosSlope.Api.Models.Dtos;

public class RmrParameterDto
{
    public string ParameterKey { get; set; } = string.Empty;
    public string SelectedCode { get; set; } = string.Empty;
    public string SelectedLabel { get; set; } = string.Empty;
    public int Score { get; set; }
    public string Source { get; set; } = "manual";
    public bool IsAuto { get; set; } = false;
}

public class RqdJointFamilyDto
{
    public string FamilyName { get; set; } = string.Empty;
    public double SpacingM { get; set; }
    public double? OrientationDeg { get; set; }
    public string Source { get; set; } = "manual";
    public bool DetectedByOpenCv { get; set; } = false;
}

public class HudsonCalculationRequest
{
    public List<RqdJointFamilyDto> JointFamilies { get; set; } = new List<RqdJointFamilyDto>();
}

public class PalmstromCalculationRequest
{
    public int DiscontinuityCount { get; set; }
    public double LineLengthM { get; set; }
}

public class RmrCalculationRequest
{
    public List<RmrParameterDto> Parameters { get; set; } = new List<RmrParameterDto>();
}

public class GeomechanicalEvaluationRequest
{
    public string? ZoneId { get; set; }
    public string? MonitoringId { get; set; }
    public string? ImageId { get; set; }
    public string? Notes { get; set; }

    public RqdCalculationDto? Rqd { get; set; }
    public RmrCalculationDto? Rmr { get; set; }
}

public class RqdCalculationDto
{
    public string Method { get; set; } = string.Empty;
    public double? Jv { get; set; }
    public double? LambdaValue { get; set; }
    public int? DiscontinuityCount { get; set; }
    public double? LineLengthM { get; set; }
    public double Value { get; set; }
    public string? Quality { get; set; }
    public List<RqdJointFamilyDto>? JointFamilies { get; set; }
}

public class RmrCalculationDto
{
    public int Value { get; set; }
    public string? Class { get; set; }
    public string? Quality { get; set; }
    public List<RmrParameterDto> Parameters { get; set; } = new List<RmrParameterDto>();
}

public class RqdCalculationResponse
{
    public string Method { get; set; } = string.Empty;
    public double? Jv { get; set; }
    public double? LambdaValue { get; set; }
    public double Value { get; set; }
    public string Quality { get; set; } = string.Empty;
}

public class RmrCalculationResponse
{
    public int Value { get; set; }
    public string Class { get; set; } = string.Empty;
    public string Quality { get; set; } = string.Empty;
}
