using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace ArgosSlope.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddGeomechanicsModule : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "geomechanical_evaluations",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    zone_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    monitoring_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    image_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    rqd_method = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    rqd_value = table.Column<double>(type: "double precision", nullable: true),
                    rqd_quality = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    rmr_value = table.Column<int>(type: "integer", nullable: true),
                    rmr_class = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    rmr_quality = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_by = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    notes = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_geomechanical_evaluations", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "rmr_catalog_option",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    parameter_key = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    label = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    score = table.Column<int>(type: "integer", nullable: false),
                    min_value = table.Column<double>(type: "double precision", nullable: true),
                    max_value = table.Column<double>(type: "double precision", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_rmr_catalog_option", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "rmr_parameters",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    evaluation_id = table.Column<int>(type: "integer", nullable: false),
                    parameter_key = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    selected_code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    selected_label = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    score = table.Column<int>(type: "integer", nullable: false),
                    source = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    is_auto = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_rmr_parameters", x => x.id);
                    table.ForeignKey(
                        name: "FK_rmr_parameters_geomechanical_evaluations_evaluation_id",
                        column: x => x.evaluation_id,
                        principalTable: "geomechanical_evaluations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "rqd_calculations",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    evaluation_id = table.Column<int>(type: "integer", nullable: false),
                    method = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    jv = table.Column<double>(type: "double precision", nullable: true),
                    lambda_value = table.Column<double>(type: "double precision", nullable: true),
                    discontinuity_count = table.Column<int>(type: "integer", nullable: true),
                    line_length_m = table.Column<double>(type: "double precision", nullable: true),
                    rqd_value = table.Column<double>(type: "double precision", nullable: false),
                    rqd_quality = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    input_data_json = table.Column<string>(type: "jsonb", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_rqd_calculations", x => x.id);
                    table.ForeignKey(
                        name: "FK_rqd_calculations_geomechanical_evaluations_evaluation_id",
                        column: x => x.evaluation_id,
                        principalTable: "geomechanical_evaluations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "rqd_joint_families",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    rqd_calculation_id = table.Column<int>(type: "integer", nullable: false),
                    family_name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    spacing_m = table.Column<double>(type: "double precision", nullable: false),
                    orientation_deg = table.Column<double>(type: "double precision", nullable: true),
                    source = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    detected_by_opencv = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_rqd_joint_families", x => x.id);
                    table.ForeignKey(
                        name: "FK_rqd_joint_families_rqd_calculations_rqd_calculation_id",
                        column: x => x.rqd_calculation_id,
                        principalTable: "rqd_calculations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_rmr_parameters_evaluation_id",
                table: "rmr_parameters",
                column: "evaluation_id");

            migrationBuilder.CreateIndex(
                name: "IX_rqd_calculations_evaluation_id",
                table: "rqd_calculations",
                column: "evaluation_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_rqd_joint_families_rqd_calculation_id",
                table: "rqd_joint_families",
                column: "rqd_calculation_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "rmr_catalog_option");

            migrationBuilder.DropTable(
                name: "rmr_parameters");

            migrationBuilder.DropTable(
                name: "rqd_joint_families");

            migrationBuilder.DropTable(
                name: "rqd_calculations");

            migrationBuilder.DropTable(
                name: "geomechanical_evaluations");
        }
    }
}
