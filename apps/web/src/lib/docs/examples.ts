import type { PlayerLookupResponse, PurchaseEvent } from '@devappstore/core';

/*
 * Valeurs d'exemple de la documentation. Le vecteur de test de signature est vérifié par examples.test.ts
 * contre `signPayload` / `verifySignature` de @devappstore/core : si l'algorithme change, la doc casse le test.
 */

export const EXAMPLE_PURCHASE: PurchaseEvent = {
  event: 'purchase.completed',
  delivery_id: 'dlv_Xq3vR8sK2mN7pL4w',
  order_id: 'ord_Hb5tW9cJ1yE6rD0a',
  game_id: 'gam_crystal',
  player_id: 'player_42',
  product_id: 'gems_500',
  item_type: 'consumable',
  quantity: 1,
  amount_cents: 499,
  currency: 'EUR',
  created_at: '2026-11-09T10:15:00.000Z',
};

export const EXAMPLE_REFUND: PurchaseEvent = {
  ...EXAMPLE_PURCHASE,
  event: 'purchase.refunded',
  delivery_id: 'dlv_Lr2yN6vB9qT3kW8e',
  created_at: '2026-11-12T08:02:41.000Z',
};

/** Corps exact envoyé (JSON compact, ordre des clés ci-dessus). */
export const EXAMPLE_BODY = JSON.stringify(EXAMPLE_PURCHASE);
export const EXAMPLE_SECRET = 'whsec_exemple';
export const EXAMPLE_TIMESTAMP = 1762683300;
export const EXAMPLE_V1 = '4a4baabe84946ffafe55571b20774128d2762793ba4b27d40522002b350eef5a';
export const EXAMPLE_SIGNATURE_HEADER = `t=${EXAMPLE_TIMESTAMP},v1=${EXAMPLE_V1}`;

/** Player lookup : la chaîne signée est `devappstore-lookup-v1:<identifiant joueur brut>`. */
export const EXAMPLE_LOOKUP_PLAYER_ID = 'player_42';
export const EXAMPLE_LOOKUP_V1 = '09370d5eec5da21917d1fd9febd5ffe9e975ba04817d5692dd94492aa553ef58';
export const EXAMPLE_LOOKUP_RESPONSE: PlayerLookupResponse = {
  player_id: 'player_42',
  display_name: 'NovaKnight',
  level: 37,
  avatar_url: 'https://cdn.monjeu.com/avatars/42.png',
};

export const json = (v: unknown) => JSON.stringify(v, null, 2);

/** Placeholders des exemples curl (variables shell). */
export const SHELL_ENV = `export BASE_URL="http://localhost:3000"   # en production : l'URL de Dev AppStore
export API_KEY="das_secret_demo_crystal_clash"  # clé de démonstration (npm run db:seed)`;

/* ------------------------------------------------------------------------------------------------
 * Vérification de signature webhook, une version par langage.
 * Toutes calculent HMAC-SHA256(secret, `${t}.${corps brut}`) en hex, comparent en temps constant
 * et refusent un horodatage à plus de 300 s.
 * ---------------------------------------------------------------------------------------------- */

export const VERIFY_NODE = `import { createHmac, timingSafeEqual } from 'node:crypto';
import express from 'express';

const SECRET = process.env.WEBHOOK_SECRET; // secret webhook du jeu (whsec_…)
const TOLERANCE_S = 300;

export function verifySignature(rawBody, header, secret = SECRET, now = Math.floor(Date.now() / 1000)) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.trim().split('=')));
  const t = Number(parts.t);
  if (!Number.isInteger(t) || !parts.v1 || Math.abs(now - t) > TOLERANCE_S) return false;
  const expected = createHmac('sha256', secret).update(\`\${t}.\${rawBody}\`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

const app = express();
// Corps BRUT : ne pas utiliser express.json() avant la vérification.
app.post('/webhooks/purchases', express.raw({ type: 'application/json' }), async (req, res) => {
  const rawBody = req.body.toString('utf8');
  if (!verifySignature(rawBody, req.get('DevAppStore-Signature'))) return res.sendStatus(401);
  const event = JSON.parse(rawBody);
  await creditOnce(event); // idempotent sur event.delivery_id
  res.sendStatus(200);
});`;

export const VERIFY_PYTHON = `import hashlib
import hmac
import json
import os
import time

from flask import Flask, abort, request

SECRET = os.environ["WEBHOOK_SECRET"].encode()
TOLERANCE_S = 300


def verify_signature(raw_body: bytes, header: str | None, secret: bytes = SECRET, now: int | None = None) -> bool:
    if not header:
        return False
    parts = dict(p.strip().split("=", 1) for p in header.split(",") if "=" in p)
    try:
        t = int(parts.get("t", ""))
    except ValueError:
        return False
    v1 = parts.get("v1")
    now = int(time.time()) if now is None else now
    if not v1 or abs(now - t) > TOLERANCE_S:
        return False
    expected = hmac.new(secret, f"{t}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, v1)


app = Flask(__name__)


@app.post("/webhooks/purchases")
def purchases():
    raw = request.get_data()  # corps brut, avant tout json.loads
    if not verify_signature(raw, request.headers.get("DevAppStore-Signature")):
        abort(401)
    event = json.loads(raw)
    credit_once(event)  # idempotent sur event["delivery_id"]
    return "", 200`;

export const VERIFY_PHP = `<?php
const TOLERANCE_S = 300;

function verify_signature(string $rawBody, ?string $header, string $secret, ?int $now = null): bool
{
    if (!$header) return false;
    $parts = [];
    foreach (explode(',', $header) as $p) {
        [$k, $v] = array_pad(explode('=', trim($p), 2), 2, '');
        $parts[$k] = $v;
    }
    $t = isset($parts['t']) && ctype_digit($parts['t']) ? (int) $parts['t'] : 0;
    $v1 = $parts['v1'] ?? '';
    $now = $now ?? time();
    if ($t === 0 || $v1 === '' || abs($now - $t) > TOLERANCE_S) return false;
    $expected = hash_hmac('sha256', $t . '.' . $rawBody, $secret);
    return hash_equals($expected, $v1);
}

$raw = file_get_contents('php://input'); // corps brut
$header = $_SERVER['HTTP_DEVAPPSTORE_SIGNATURE'] ?? null;
if (!verify_signature($raw, $header, getenv('WEBHOOK_SECRET'))) {
    http_response_code(401);
    exit;
}
$event = json_decode($raw, true);
credit_once($event); // idempotent sur $event['delivery_id']
http_response_code(200);`;

export const VERIFY_GO = `package webhooks

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"math"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

const toleranceS = 300

func VerifySignature(rawBody []byte, header, secret string, now time.Time) bool {
	var t int64
	var v1 string
	for _, p := range strings.Split(header, ",") {
		k, v, _ := strings.Cut(strings.TrimSpace(p), "=")
		switch k {
		case "t":
			t, _ = strconv.ParseInt(v, 10, 64)
		case "v1":
			v1 = v
		}
	}
	if t == 0 || v1 == "" || math.Abs(float64(now.Unix()-t)) > toleranceS {
		return false
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(strconv.FormatInt(t, 10) + "."))
	mac.Write(rawBody)
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(v1))
}

func PurchasesHandler(w http.ResponseWriter, r *http.Request) {
	raw, err := io.ReadAll(io.LimitReader(r.Body, 1<<20)) // corps brut
	if err != nil || !VerifySignature(raw, r.Header.Get("DevAppStore-Signature"), os.Getenv("WEBHOOK_SECRET"), time.Now()) {
		http.Error(w, "signature invalide", http.StatusUnauthorized)
		return
	}
	var event map[string]any
	if err := json.Unmarshal(raw, &event); err != nil {
		http.Error(w, "json invalide", http.StatusBadRequest)
		return
	}
	creditOnce(event) // idempotent sur event["delivery_id"]
	w.WriteHeader(http.StatusOK)
}`;

export const VERIFY_CSHARP = `using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

public static class WebhookSignature
{
    const int ToleranceS = 300;

    public static bool Verify(string rawBody, string? header, string secret, DateTimeOffset? now = null)
    {
        if (string.IsNullOrEmpty(header)) return false;
        long t = 0;
        string? v1 = null;
        foreach (var part in header.Split(','))
        {
            var kv = part.Trim().Split('=', 2);
            if (kv.Length != 2) continue;
            if (kv[0] == "t") long.TryParse(kv[1], out t);
            else if (kv[0] == "v1") v1 = kv[1];
        }
        var nowS = (now ?? DateTimeOffset.UtcNow).ToUnixTimeSeconds();
        if (t == 0 || v1 is null || Math.Abs(nowS - t) > ToleranceS) return false;
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret));
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes($"{t}.{rawBody}"));
        var expected = Convert.ToHexString(hash).ToLowerInvariant();
        return CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(expected), Encoding.ASCII.GetBytes(v1));
    }
}

// ASP.NET Core (minimal API)
app.MapPost("/webhooks/purchases", async (HttpRequest req) =>
{
    using var reader = new StreamReader(req.Body, Encoding.UTF8);
    var raw = await reader.ReadToEndAsync(); // corps brut
    if (!WebhookSignature.Verify(raw, req.Headers["DevAppStore-Signature"], Environment.GetEnvironmentVariable("WEBHOOK_SECRET")!))
        return Results.Unauthorized();
    var evt = JsonSerializer.Deserialize<PurchaseEvent>(raw)!;
    await CreditOnce(evt); // idempotent sur evt.delivery_id
    return Results.Ok();
});`;
