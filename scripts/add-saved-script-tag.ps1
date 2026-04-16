# add-saved-script-tag.ps1
# Insere supabase.saved.adapter.js entre media e notifications em todos os HTMLs

$rootDir = "C:\Users\yan1n\Documents\GitHub\kino-campus"

$rootFiles = @(
  "_product.html","account-setup.html","achados-perdidos.html","ajuda.html",
  "auth-callback.html","caronas-feed.html","compra-venda-feed.html","create-post.html",
  "eventos.html","index.html","moradia.html","my-posts.html","ods.html",
  "oportunidades.html","profile.html","search-results.html","settings.html"
)

$adminFiles = @(
  "admin\banners.html","admin\help-requests.html","admin\index.html",
  "admin\moderation.html","admin\reports.html"
)

$rootOld = '<script defer src="assets/js/adapters/supabase.media.adapter.js"></script>'
$rootNew = '<script defer src="assets/js/adapters/supabase.media.adapter.js"></script>
    <script defer src="assets/js/adapters/supabase.saved.adapter.js"></script>'

$adminOld = '<script defer src="../assets/js/adapters/supabase.media.adapter.js"></script>'
$adminNew = '<script defer src="../assets/js/adapters/supabase.media.adapter.js"></script>
    <script defer src="../assets/js/adapters/supabase.saved.adapter.js"></script>'

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

foreach ($f in $rootFiles) {
  $path = Join-Path $rootDir $f
  if (Test-Path $path) {
    $content = [System.IO.File]::ReadAllText($path, $utf8NoBom)
    if ($content -notmatch [regex]::Escape("supabase.saved.adapter.js")) {
      $content = $content.Replace($rootOld, $rootNew)
      [System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
      Write-Host "Updated: $f"
    } else {
      Write-Host "Already has tag: $f"
    }
  } else {
    Write-Host "NOT FOUND: $f"
  }
}

foreach ($f in $adminFiles) {
  $path = Join-Path $rootDir $f
  if (Test-Path $path) {
    $content = [System.IO.File]::ReadAllText($path, $utf8NoBom)
    if ($content -notmatch [regex]::Escape("supabase.saved.adapter.js")) {
      $content = $content.Replace($adminOld, $adminNew)
      [System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
      Write-Host "Updated: $f"
    } else {
      Write-Host "Already has tag: $f"
    }
  } else {
    Write-Host "NOT FOUND: $f"
  }
}

Write-Host "Done."
