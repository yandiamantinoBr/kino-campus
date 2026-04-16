# add-profiles-script-tag.ps1
# Insere supabase.profiles.adapter.js antes de supabase.adapter.js em todos os HTMLs

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

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

foreach ($f in $rootFiles) {
  $path = Join-Path $rootDir $f
  if (Test-Path $path) {
    $content = [System.IO.File]::ReadAllText($path, $utf8NoBom)
    if ($content -notmatch [regex]::Escape("supabase.profiles.adapter.js")) {
      $pattern = '(<script defer src="assets/js/adapters/supabase\.adapter\.js"></script>)'
      $replacement = '<script defer src="assets/js/adapters/supabase.profiles.adapter.js"></script>' + "`r`n  " + '$1'
      $newContent = [regex]::Replace($content, $pattern, $replacement)
      if ($newContent -ne $content) {
        [System.IO.File]::WriteAllText($path, $newContent, $utf8NoBom)
        Write-Host "Updated: $f"
      } else {
        Write-Host "Pattern not matched: $f"
      }
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
    if ($content -notmatch [regex]::Escape("supabase.profiles.adapter.js")) {
      $pattern = '(<script defer src="\.\./assets/js/adapters/supabase\.adapter\.js"></script>)'
      $replacement = '<script defer src="../assets/js/adapters/supabase.profiles.adapter.js"></script>' + "`r`n  " + '$1'
      $newContent = [regex]::Replace($content, $pattern, $replacement)
      if ($newContent -ne $content) {
        [System.IO.File]::WriteAllText($path, $newContent, $utf8NoBom)
        Write-Host "Updated: $f"
      } else {
        Write-Host "Pattern not matched: $f"
      }
    } else {
      Write-Host "Already has tag: $f"
    }
  } else {
    Write-Host "NOT FOUND: $f"
  }
}

Write-Host "Done."
