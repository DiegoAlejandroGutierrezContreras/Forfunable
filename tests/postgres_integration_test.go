package tests

import (
	"context"
	"os"
	"testing"
	"time"

	"forfunable/models"
	"forfunable/repository"
	"golang.org/x/crypto/bcrypt"
)

// TestPostgresIntegration valida las operaciones CRUD y transacciones
// directamente contra una base de datos PostgreSQL real (Cloud SQL o local).
// Si DATABASE_URL o TEST_DATABASE_URL no están definidas, omite la prueba de forma segura.
func TestPostgresIntegration(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		dsn = os.Getenv("DATABASE_URL")
	}

	if dsn == "" {
		t.Skip("Omitiendo TestPostgresIntegration: DATABASE_URL o TEST_DATABASE_URL no configurada.")
	}

	repo, err := repository.NewPostgresRepository(dsn)
	if err != nil {
		t.Fatalf("Fallo al conectar con PostgreSQL: %v", err)
	}
	defer repo.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// 1. Validar Health / Ping
	t.Run("Ping Database", func(t *testing.T) {
		if err := repo.Ping(ctx); err != nil {
			t.Fatalf("Ping falló: %v", err)
		}
	})

	// 2. Crear y Consultar Usuario
	testUsername := "integration_user_" + time.Now().Format("150405")
	testEmail := testUsername + "@example.com"
	hash, err := bcrypt.GenerateFromPassword([]byte("Password123!"), bcrypt.DefaultCost)
	if err != nil {
		t.Fatalf("Error al generar hash bcrypt: %v", err)
	}

	createdUser := &models.User{
		Username:     testUsername,
		Email:        testEmail,
		PasswordHash: string(hash),
		GlobalRole:   "USER",
		Bio:          "Usuario de prueba de integración",
	}

	t.Run("Create User in Postgres", func(t *testing.T) {
		err := repo.CreateUser(createdUser)
		if err != nil {
			t.Fatalf("Error al crear usuario en Postgres: %v", err)
		}
		if createdUser.ID == "" {
			t.Fatalf("El ID generado del usuario no debe estar vacío")
		}
	})

	// 3. Obtener Usuario por ID y Validar Password
	t.Run("Get User By ID and Check Password", func(t *testing.T) {
		fetched, err := repo.GetUserByID(createdUser.ID)
		if err != nil {
			t.Fatalf("Error al obtener usuario por ID: %v", err)
		}
		if fetched.Username != testUsername {
			t.Errorf("Username esperado %s, obtenido %s", testUsername, fetched.Username)
		}
		if err := bcrypt.CompareHashAndPassword([]byte(fetched.PasswordHash), []byte("Password123!")); err != nil {
			t.Errorf("La contraseña hash no coincide: %v", err)
		}
	})

	// 4. Crear Comunidad
	testCommName := "comm_" + time.Now().Format("150405")
	createdComm := &models.Community{
		Name:        testCommName,
		Description: "Comunidad de integración en Cloud SQL",
		CreatorID:   createdUser.ID,
	}

	t.Run("Create Community in Postgres", func(t *testing.T) {
		err := repo.CreateCommunity(createdComm)
		if err != nil {
			t.Fatalf("Error al crear comunidad en Postgres: %v", err)
		}
		if createdComm.ID == "" {
			t.Fatalf("El ID de comunidad no debe estar vacío")
		}
	})

	// 5. Crear Publicación
	createdPost := &models.Post{
		CommunityID: createdComm.ID,
		AuthorID:    createdUser.ID,
		Title:       "Post de integración en Cloud SQL",
		ContentType: "TEXT",
		BodyText:    "Contenido de prueba almacenado en PostgreSQL.",
	}

	t.Run("Create Post in Postgres", func(t *testing.T) {
		err := repo.CreatePost(createdPost)
		if err != nil {
			t.Fatalf("Error al crear post en Postgres: %v", err)
		}
		if createdPost.ID == "" {
			t.Fatalf("El ID del post no debe estar vacío")
		}
	})

	// 6. Votar por la Publicación
	t.Run("Vote Post and Update Score", func(t *testing.T) {
		_, err := repo.VotePost(createdUser.ID, createdPost.ID, 1)
		if err != nil {
			t.Fatalf("Error al registrar voto: %v", err)
		}

		postDetail, err := repo.GetPostByID(createdPost.ID)
		if err != nil {
			t.Fatalf("Error al consultar post con voto: %v", err)
		}
		if postDetail.UpvotesCount < 1 {
			t.Errorf("UpvotesCount esperado >= 1, obtenido %d", postDetail.UpvotesCount)
		}
	})
}
