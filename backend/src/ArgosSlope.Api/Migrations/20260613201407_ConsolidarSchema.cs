using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace ArgosSlope.Api.Migrations
{
    /// <inheritdoc />
    public partial class ConsolidarSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "configuracion",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    clave = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    valor = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    descripcion = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_configuracion", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "fisura",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    roi_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    fecha_deteccion = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    largo = table.Column<double>(type: "double precision", nullable: false),
                    ancho = table.Column<double>(type: "double precision", nullable: false),
                    area = table.Column<double>(type: "double precision", nullable: false),
                    unidad = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "px"),
                    calibrado = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    confianza = table.Column<double>(type: "double precision", nullable: false, defaultValue: 0.0),
                    origen = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValue: "real"),
                    estado_alerta = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    device_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    orientacion = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    tipo = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    coordenadas = table.Column<string>(type: "text", nullable: true),
                    imagen_original = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    imagen_segmentada = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_fisura", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "snapshot_3d",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    device_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    captured_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    payload_json = table.Column<string>(type: "jsonb", nullable: false),
                    point_count = table.Column<int>(type: "integer", nullable: false),
                    crack_count = table.Column<int>(type: "integer", nullable: false),
                    mesh_vertex_count = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_snapshot_3d", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "alerta",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    fisura_id = table.Column<int>(type: "integer", nullable: true),
                    fecha = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    tipo = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    mensaje = table.Column<string>(type: "text", nullable: false),
                    umbral_superado = table.Column<double>(type: "double precision", nullable: false),
                    valor_actual = table.Column<double>(type: "double precision", nullable: false),
                    reconocida = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_alerta", x => x.id);
                    table.ForeignKey(
                        name: "FK_alerta_fisura_fisura_id",
                        column: x => x.fisura_id,
                        principalTable: "fisura",
                        principalColumn: "id");
                });

            migrationBuilder.CreateTable(
                name: "medicion_diaria",
                columns: table => new
                {
                    id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    fisura_id = table.Column<int>(type: "integer", nullable: false),
                    fecha = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    largo = table.Column<double>(type: "double precision", nullable: false),
                    ancho = table.Column<double>(type: "double precision", nullable: false),
                    area = table.Column<double>(type: "double precision", nullable: false),
                    delta_porcentaje = table.Column<double>(type: "double precision", nullable: true),
                    es_critica = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_medicion_diaria", x => x.id);
                    table.ForeignKey(
                        name: "FK_medicion_diaria_fisura_fisura_id",
                        column: x => x.fisura_id,
                        principalTable: "fisura",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_alerta_fisura_id",
                table: "alerta",
                column: "fisura_id");

            migrationBuilder.CreateIndex(
                name: "IX_configuracion_clave",
                table: "configuracion",
                column: "clave",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_medicion_diaria_fisura_id",
                table: "medicion_diaria",
                column: "fisura_id");

            migrationBuilder.CreateIndex(
                name: "IX_snapshot_3d_device_id_captured_at",
                table: "snapshot_3d",
                columns: new[] { "device_id", "captured_at" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "alerta");

            migrationBuilder.DropTable(
                name: "configuracion");

            migrationBuilder.DropTable(
                name: "medicion_diaria");

            migrationBuilder.DropTable(
                name: "snapshot_3d");

            migrationBuilder.DropTable(
                name: "fisura");
        }
    }
}
