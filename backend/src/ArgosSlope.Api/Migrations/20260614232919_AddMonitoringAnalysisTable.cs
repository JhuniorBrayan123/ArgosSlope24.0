using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ArgosSlope.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddMonitoringAnalysisTable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "monitoring_analyses",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    capture_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    zone_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    is_base_image = table.Column<bool>(type: "boolean", nullable: false),
                    processed_image_path = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    analysis_json = table.Column<string>(type: "jsonb", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_monitoring_analyses", x => x.id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "monitoring_analyses");
        }
    }
}
