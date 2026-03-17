#!/bin/bash
set -e

echo "=== BahisPro Kurulum ==="

cd "$(dirname "$0")"

if [ ! -f ".env" ]; then
  cp env.example .env
  echo "UYARI: .env dosyası oluşturuldu. ODDS_API_KEY değerini girin (veya demo mod ile devam edin)."
fi

echo "Docker imajları build ediliyor..."
docker compose build

echo "Servisler başlatılıyor..."
docker compose up -d

echo ""
echo "=== Kurulum Tamamlandı ==="
echo "Frontend: http://localhost:3000"
echo "Backend:  http://localhost:4000"
echo ""
echo "Admin giriş bilgileri:"
echo "  Kullanıcı: admin"
echo "  Şifre:     password"
echo ""
echo "Logları izlemek için: docker compose logs -f"
