# VitaminKu — pasang ke Vercel (sekali jalan). Jalankan di Windows PowerShell. Perlu Node.js (https://nodejs.org) terpasang.
# Nilai rahasia DIKETIK di jendela ini saja (tidak tampil di layar, tidak masuk chat/repo). Isi dari Supabase → Project Settings → API.
$ErrorActionPreference = "Stop"
$dir = Join-Path $HOME "vitaminku-deploy"
if (Test-Path $dir) { Remove-Item $dir -Recurse -Force }
git clone --depth 1 --branch feat/launch-ready-v3 https://github.com/alexanderfortuna-dev/vitaminku-commerce.git $dir
Set-Location $dir
npx --yes vercel@latest login
npx --yes vercel@latest link --yes --project vitaminku
function Tambah($nama, $rahasia) {
  $s = Read-Host "Isi $nama" -AsSecureString
  $v = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
  if ([string]::IsNullOrWhiteSpace($v)) { Write-Host "Lewati $nama"; return }
  $v | npx --yes vercel@latest env add $nama production --force | Out-Null
  Write-Host "OK $nama"
}
$url = Read-Host "Supabase URL (https://vmhoohfwjtsojgcvopaf.supabase.co)"
$pub = Read-Host "Supabase Publishable/anon key"
$site = Read-Host "Alamat situs (kosongkan dulu bila belum ada; akan diisi setelah deploy)"
foreach ($p in @(@("SUPABASE_URL",$url),@("VITE_SUPABASE_URL",$url),@("SUPABASE_PUBLISHABLE_KEY",$pub),@("VITE_SUPABASE_PUBLISHABLE_KEY",$pub),@("SITE_URL",$site),@("VITE_SITE_URL",$site))) {
  if ($p[1]) { $p[1] | npx --yes vercel@latest env add $p[0] production --force | Out-Null; Write-Host "OK $($p[0])" }
}
Tambah "SUPABASE_SERVICE_ROLE_KEY"
Tambah "ANTHROPIC_API_KEY"
npx --yes vercel@latest deploy --prod --yes
Write-Host "Selesai. Salin alamat 'Production:' di atas dan kirim ke Claude."
