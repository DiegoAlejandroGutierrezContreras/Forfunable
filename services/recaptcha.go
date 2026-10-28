package services

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Acciones de reCAPTCHA Enterprise esperadas por el backend.
// El frontend debe usar exactamente estos nombres en grecaptcha.enterprise.execute(siteKey, { action }).
const (
	RecaptchaActionLogin           = "LOGIN"
	RecaptchaActionRegister        = "REGISTER"
	RecaptchaActionCreateCommunity = "CREATE_COMMUNITY"
)

// ErrRecaptchaRejected indica que el token es inválido, no corresponde a la acción o tiene riesgo alto.
var ErrRecaptchaRejected = errors.New("verificación reCAPTCHA rechazada")

// RecaptchaVerifier define la interfaz para evaluar tokens de reCAPTCHA Enterprise
type RecaptchaVerifier interface {
	Verify(ctx context.Context, token, expectedAction string) error
}

// EnterpriseRecaptchaVerifier evalúa tokens contra la API REST de reCAPTCHA Enterprise (Account Defender)
type EnterpriseRecaptchaVerifier struct {
	projectID string
	siteKey   string
	apiKey    string
	minScore  float64
	endpoint  string
	client    *http.Client
}

// NewEnterpriseRecaptchaVerifier crea el verificador real.
// Todos los parámetros deben provenir de variables de entorno (la API key desde Secret Manager).
func NewEnterpriseRecaptchaVerifier(projectID, siteKey, apiKey string, minScore float64) (*EnterpriseRecaptchaVerifier, error) {
	if projectID == "" || siteKey == "" || apiKey == "" {
		return nil, fmt.Errorf("RECAPTCHA_PROJECT_ID, RECAPTCHA_SITE_KEY y RECAPTCHA_API_KEY son obligatorios cuando RECAPTCHA_BYPASS=false")
	}
	return &EnterpriseRecaptchaVerifier{
		projectID: projectID,
		siteKey:   siteKey,
		apiKey:    apiKey,
		minScore:  minScore,
		endpoint:  "https://recaptchaenterprise.googleapis.com/v1/projects/" + url.PathEscape(projectID) + "/assessments",
		client:    &http.Client{Timeout: 5 * time.Second},
	}, nil
}

type recaptchaAssessmentRequest struct {
	Event struct {
		Token          string `json:"token"`
		SiteKey        string `json:"siteKey"`
		ExpectedAction string `json:"expectedAction"`
	} `json:"event"`
}

type recaptchaAssessmentResponse struct {
	TokenProperties struct {
		Valid         bool   `json:"valid"`
		InvalidReason string `json:"invalidReason"`
		Action        string `json:"action"`
	} `json:"tokenProperties"`
	RiskAnalysis struct {
		Score   float64  `json:"score"`
		Reasons []string `json:"reasons"`
	} `json:"riskAnalysis"`
}

// Verify crea un assessment y rechaza tokens inválidos, de otra acción o con puntuación inferior a minScore.
// Devuelve ErrRecaptchaRejected si el token no supera la evaluación, u otro error si la API no respondió.
func (v *EnterpriseRecaptchaVerifier) Verify(ctx context.Context, token, expectedAction string) error {
	if strings.TrimSpace(token) == "" {
		return fmt.Errorf("%w: token ausente", ErrRecaptchaRejected)
	}

	var payload recaptchaAssessmentRequest
	payload.Event.Token = token
	payload.Event.SiteKey = v.siteKey
	payload.Event.ExpectedAction = expectedAction

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, v.endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	// La API key viaja en cabecera para no quedar registrada en logs de URLs.
	req.Header.Set("X-Goog-Api-Key", v.apiKey)

	resp, err := v.client.Do(req)
	if err != nil {
		return fmt.Errorf("reCAPTCHA Enterprise no disponible: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("reCAPTCHA Enterprise respondió HTTP %d", resp.StatusCode)
	}

	var assessment recaptchaAssessmentResponse
	if err := json.NewDecoder(resp.Body).Decode(&assessment); err != nil {
		return fmt.Errorf("respuesta de reCAPTCHA Enterprise ilegible: %w", err)
	}

	if !assessment.TokenProperties.Valid {
		return fmt.Errorf("%w: token inválido (%s)", ErrRecaptchaRejected, assessment.TokenProperties.InvalidReason)
	}
	if assessment.TokenProperties.Action != expectedAction {
		return fmt.Errorf("%w: acción %q no coincide con %q", ErrRecaptchaRejected, assessment.TokenProperties.Action, expectedAction)
	}
	if assessment.RiskAnalysis.Score < v.minScore {
		return fmt.Errorf("%w: puntuación de riesgo %.2f inferior a %.2f", ErrRecaptchaRejected, assessment.RiskAnalysis.Score, v.minScore)
	}
	return nil
}

// BypassRecaptchaVerifier acepta cualquier token. Solo para desarrollo local y tests (RECAPTCHA_BYPASS=true).
type BypassRecaptchaVerifier struct{}

func (BypassRecaptchaVerifier) Verify(ctx context.Context, token, expectedAction string) error {
	return nil
}
