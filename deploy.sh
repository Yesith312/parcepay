#!/data/data/com.termux/files/usr/bin/bash
# Sube TODO el proyecto ParcePay a un repositorio PRIVADO tuyo en GitHub.
# Render lo lee de ahi (usa la carpeta server) y se actualiza solo cada vez que corras este archivo.
set -e
AQUI="$(cd "$(dirname "$0")" && pwd)"
command -v git >/dev/null || pkg install -y git
command -v gh >/dev/null || pkg install -y gh
gh auth status >/dev/null 2>&1 || gh auth login
git config --global user.name  >/dev/null || git config --global user.name "ParcePay"
git config --global user.email >/dev/null || git config --global user.email "parcepay@users.noreply.github.com"
S="$HOME/parcepay-repo"
mkdir -p "$S"
cp -r "$AQUI/." "$S/"
rm -rf "$S/build"
cd "$S"
[ -d .git ] || git init -b main
git branch -M main
git add .
git commit -m "ParcePay" || true
if git remote get-url origin >/dev/null 2>&1; then
  git push -u origin main
elif ! gh repo create parcepay --private --source=. --remote=origin --push; then
  # el repositorio ya existia en tu GitHub: lo conectamos
  U=$(gh api user -q .login)
  git remote add origin "https://github.com/$U/parcepay.git"
  git push -u origin main
fi
echo "Listo. Repositorio privado: parcepay. Render se actualiza solo."
