# DevOps Task Board

Application de gestion de tâches déployée sur votre VM Ubuntu avec Docker Compose, GitHub Actions, Prometheus et Grafana. La création et la configuration de la VM Vagrant sont hors de ce dépôt.

## Architecture

- **VM Ubuntu** : machine existante, accessible via son IP privée (par exemple `192.168.56.10`).
- **Docker Compose** : application Node.js, Prometheus et Grafana sur un réseau Docker privé.
- **Persistance** : tâches conservées dans le volume Docker nommé `todo-data`.
- **CI/CD** : le workflow GitHub Actions reconstruit uniquement `todo-app` sur un runner Linux auto-hébergé installé dans la VM.
- **Observabilité** : Prometheus collecte les métriques toutes les 10 secondes; Grafana charge automatiquement la source Prometheus et le tableau de bord.

## Prérequis

Prérequis : une VM Ubuntu avec accès Internet, un compte GitHub, et les ports `5111`, `9090` et `3000` accessibles depuis le poste hôte.

## Publier le dépôt sur GitHub

Créez un dépôt vide sur GitHub (sans README ni licence). Depuis le dossier du projet sur votre poste, initialisez le dépôt et poussez le code. Remplacez `<URL_DU_DEPOT>` par l’URL HTTPS ou SSH fournie par GitHub :

```bash
git init
git add .
git commit -m "Initialise DevOps Task Board"
git branch -M main
git remote add origin <URL_DU_DEPOT>
git push -u origin main
```

## Installer Docker et déployer dans Ubuntu

Connectez-vous à la VM en SSH (remplacez l’adresse par l’IP réelle de votre VM), puis installez Docker Engine et Docker Compose :

```bash
ssh <utilisateur>@192.168.56.10
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
```

Reconnectez-vous en SSH pour appliquer l’ajout au groupe `docker`. Le runner GitHub Actions récupérera le dépôt dans son propre espace de travail; ne démarrez pas Compose depuis un autre clone, car cela créerait un deuxième projet Compose.

```bash
docker compose version
```

L’application et les outils sont accessibles via l’IP de la VM : `http://192.168.56.10:5111` (application), `http://192.168.56.10:9090` (Prometheus) et `http://192.168.56.10:3000` (Grafana). Remplacez l’adresse par celle de votre VM, si nécessaire.

## Configurer GitHub Actions dans la VM

Dans GitHub, ouvrez **Settings > Actions > Runners > New self-hosted runner**, choisissez **Linux x64** et suivez les commandes indiquées. GitHub fournit l’URL de téléchargement correspondant à la version actuelle et un jeton temporaire; exécutez les commandes de téléchargement et de configuration dans la VM, dans un répertoire dédié, par exemple `~/actions-runner`. Ne publiez pas et ne partagez pas le jeton.

Après avoir configuré le runner avec les commandes affichées par GitHub, installez et démarrez son service :

```bash
cd ~/actions-runner
sudo ./svc.sh install "$USER"
sudo ./svc.sh start
sudo ./svc.sh status
```

Si le runner a été configuré et installé avec le compte Ubuntu courant, ajoutez ce compte au groupe Docker, puis redémarrez le service pour prendre en compte le nouveau groupe :

```bash
sudo usermod -aG docker "$USER"
cd ~/actions-runner
sudo ./svc.sh stop
sudo ./svc.sh start
```

Vérifiez dans GitHub que le runner est « Idle ». Le workflow `.github/workflows/deploy.yml` se déclenche sur chaque `push` vers `main`; il récupère le dépôt dans son propre espace de travail, reconstruit `todo-app` et vérifie que l’API répond. Les fichiers Compose et l’application font partie de ce dépôt.

Après la première exécution réussie du workflow, lancez Prometheus et Grafana depuis le même espace de travail utilisé par le runner (remplacez `<nom-du-depot>` par le nom du dépôt GitHub) :

```bash
cd ~/actions-runner/_work/<nom-du-depot>/<nom-du-depot>
docker compose up -d
docker compose ps
```

Le service `todo-app` est alors géré par le même projet Compose que celui utilisé par le workflow. Les exécutions suivantes du workflow mettent à jour ce conteneur, tandis que Prometheus et Grafana restent démarrés.

Le runner auto-hébergé exécute du code provenant du dépôt. Utilisez-le uniquement pour un dépôt de confiance et gardez-le dédié à ce projet.

## API et métriques

| Méthode | Route | Description |
| --- | --- | --- |
| `GET` | `/api/tasks` | Liste des tâches |
| `POST` | `/api/tasks` | Crée une tâche (`{"title":"..."}`) |
| `PATCH` | `/api/tasks/:id` | Modifie son état (`{"completed":true}`) |
| `DELETE` | `/api/tasks/:id` | Supprime une tâche |
| `GET` | `/metrics` | Métriques Prometheus |

Métriques personnalisées :

- `app_http_requests_total{method,route,status}` : requêtes HTTP, ventilées par méthode, route et statut.
- `app_tasks_created_total` : nombre de tâches créées.

Les métriques runtime Node.js par défaut de `prom-client` sont également exposées. Dans Prometheus, **Status > Targets** doit afficher `todo-app` en état `UP`. Dans Grafana, connectez-vous avec `admin` / `admin` et ouvrez le tableau de bord **DevOps Task Board**. Changez le mot de passe lors de la première connexion si nécessaire.

## Persistance et commandes utiles

Le volume `todo-data` survit à la recréation du conteneur :

```bash
docker compose logs -f todo-app
docker compose restart
docker compose down
```

`docker compose down` ne supprime pas les volumes. Pour réinitialiser explicitement les données locales de démonstration, utilisez `docker compose down --volumes` (cela efface les tâches et les données de métriques/tableaux de bord).

## Démonstration

1. Ouvrez l’application, créez une tâche, cochez-la, puis rechargez la page pour vérifier la persistance.
2. Vérifiez la cible `todo-app` dans Prometheus, puis observez les compteurs dans le tableau de bord Grafana.
3. Modifiez le frontend ou le serveur, poussez sur `main` et suivez l’exécution du workflow. Après le succès du job, rechargez l’application.

La première initialisation des images Docker peut prendre quelques minutes et nécessite une connexion Internet depuis la VM.
