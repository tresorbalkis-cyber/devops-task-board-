# Guide de test complet — CC DevOps Task Board

Ce guide vérifie le parcours de bout en bout : VM Vagrant, Docker Compose, application exposée, Prometheus/Grafana et déploiement automatique par GitHub Actions.

## Architecture utilisée

- **Vagrant / VirtualBox** : VM Ubuntu accessible sur `192.168.56.10`.
- **Docker Compose** : `todo-app`, `prometheus` et `grafana`.
- **GitHub Actions** : runner self-hosted Linux installé dans la VM; le workflow reconstruit `todo-app` après un `push` sur `main`.
- **Dépôt applicatif** : [tresorbalkis-cyber/devops-task-board-](https://github.com/tresorbalkis-cyber/devops-task-board-).
- Le `Vagrantfile` et `provision.sh` utilisés pour créer la VM restent dans `C:\mon-projet-vagrant`, hors du dépôt applicatif.

## 1. Démarrer et vérifier la VM

Dans **PowerShell Windows** :

```powershell
cd C:\mon-projet-vagrant
vagrant status
```

Le résultat attendu est `running`. Si la VM est arrêtée :

```powershell
vagrant up
```

Vérifier l’adresse réseau privée :

```powershell
vagrant ssh -c "ip -br -4 addr"
```

La sortie doit inclure `192.168.56.10` sur l’interface privée. Les commandes suivantes s’exécutent ensuite dans la VM :

```powershell
vagrant ssh
```

À l’invite `vagrant@ubuntu-jammy`, vérifier Docker :

```bash
docker --version
docker compose version
```

## 2. Vérifier le runner GitHub Actions

Dans GitHub, ouvrir **Settings → Actions → Runners** du dépôt. Le runner `ubuntu-jammy` doit être en état **Idle** lorsqu’aucun job ne tourne.

Si le runner est lancé manuellement dans la VM, le laisser actif dans son terminal :

```bash
cd ~/actions-runner
./run.sh
```

Ne pas enregistrer de jeton GitHub dans le dépôt ou dans `provision.sh`. Pour une utilisation persistante après redémarrage, installer le runner comme service en suivant les instructions GitHub et vérifier son statut avec `sudo ./svc.sh status`.

## 3. Vérifier les conteneurs

Le workflow déploie `todo-app`. Prometheus et Grafana sont démarrés avec Compose depuis le même espace de travail du runner :

```bash
cd ~/actions-runner/_work/devops-task-board-/devops-task-board-
docker compose up -d
docker compose ps
```

Résultat attendu : les services `todo-app`, `prometheus` et `grafana` sont `Up`.

Vérifier les réponses HTTP depuis Ubuntu :

```bash
curl -i http://127.0.0.1:5111/api/tasks
curl -i http://127.0.0.1:5111/metrics
curl -i http://127.0.0.1:9090/-/healthy
curl -i http://127.0.0.1:3000/api/health
```

Les routes API, métriques, santé Prometheus et santé Grafana doivent répondre avec un statut `200`.

## 4. Vérifier l’accès depuis Windows

Dans PowerShell Windows, utiliser `curl.exe` (et non l’alias PowerShell `curl`) :

```powershell
curl.exe -i http://192.168.56.10:5111/api/tasks
curl.exe -i http://192.168.56.10:9090/-/healthy
curl.exe -i http://192.168.56.10:3000/api/health
```

Les trois requêtes doivent répondre `200 OK`. On peut également tester les interfaces dans un navigateur :

- Application : <http://192.168.56.10:5111>
- Prometheus : <http://192.168.56.10:9090>
- Prometheus Targets : <http://192.168.56.10:9090/targets>
- Grafana : <http://192.168.56.10:3000>

Le port `8080` est transféré par Vagrant, mais aucun service de cette pile ne l’utilise.

## 5. Tester l’application et la persistance

1. Ouvrir <http://192.168.56.10:5111>.
2. Ajouter une tâche, la marquer comme terminée, puis la supprimer.
3. Ajouter une nouvelle tâche et actualiser la page : elle doit rester présente.
4. Depuis Ubuntu, redémarrer uniquement l’application :

   ```bash
   cd ~/actions-runner/_work/devops-task-board-/devops-task-board-
   docker compose restart todo-app
   ```

5. Actualiser l’application : la tâche doit toujours être présente grâce au volume `todo-data`.

## 6. Tester Prometheus et Grafana

1. Ouvrir <http://192.168.56.10:9090/targets>.
2. Vérifier que la cible `todo-app` est **UP**.
3. Dans Prometheus, exécuter la requête :

   ```promql
   app_http_requests_total
   ```

4. Ouvrir Grafana et se connecter avec `admin` / `admin` si les identifiants n’ont pas encore été modifiés.
5. Ouvrir le tableau de bord **DevOps Task Board**.
6. Faire quelques actions dans l’application et vérifier l’évolution des requêtes HTTP et des tâches créées.

Changer le mot de passe Grafana par défaut avant toute utilisation autre qu’une démonstration locale.

## 7. Démontrer la mise à jour automatique

Depuis le dossier du dépôt sur Windows, modifier un texte visible, par exemple dans `app\public\index.html`, puis pousser le changement :

```powershell
cd "C:\Users\balki\OneDrive\Desktop\Devops Tasks Board"
git add app/public/index.html
git commit -m "Teste la mise à jour automatique"
git push origin main
```

Vérifications :

1. Dans GitHub, ouvrir **Actions** et constater qu’un nouveau workflow est lancé sur `main`.
2. Vérifier que le runner self-hosted prend le job et que toutes les étapes sont vertes, notamment la construction et le déploiement de `todo-app`.
3. Recharger <http://192.168.56.10:5111> avec un rafraîchissement forcé (`Ctrl+F5`) : le nouveau texte doit apparaître.
4. Vérifier dans Ubuntu que `todo-app` est toujours actif :

   ```bash
   docker ps
   ```

Ce test valide le cycle : **modification du code → push GitHub → GitHub Actions → runner dans la VM → reconstruction Docker → nouvelle version accessible par IP**.

## 8. Résultats à conserver pour la présentation

- `vagrant status` indique `running`.
- Capture de `docker compose ps` avec les trois conteneurs `Up`.
- Capture de l’application accessible sur `192.168.56.10:5111`.
- Capture de Prometheus Targets avec `todo-app` en état `UP`.
- Capture du tableau de bord Grafana.
- Capture du workflow GitHub Actions vert après le test de modification.
- Ancien service `todo-app.service` désactivé et ancienne redirection `5111 → 3000` absente.

## Dépannage rapide

- **Job GitHub en attente** : vérifier que le runner self-hosted est `Idle` ou actif; laisser `./run.sh` tourner.
- **Erreur Docker permission denied** : vérifier que le compte `vagrant` est dans le groupe `docker`, puis se reconnecter à la VM.
- **Erreur `Cannot GET /api/tasks` sur le port 5111** : vérifier que l’ancien `todo-app.service` est inactif et que les règles NAT `5111 → 3000` ne sont pas revenues.
- **Prometheus affiche la cible DOWN** : vérifier `docker compose ps`, les logs de `todo-app` (`docker compose logs --tail=80 todo-app`) et l’accès à `http://127.0.0.1:5111/metrics` depuis la VM.
- **Téléchargement d’image interrompu** : depuis le dossier Compose du runner, relancer `docker compose up -d`; Docker reprend les téléchargements disponibles.

Ne pas relancer `vagrant provision` avec une ancienne version de `provision.sh` : elle réinstallait l’ancienne application et la redirection de port. Le script de provisionnement doit rester celui qui installe Docker et désactive l’ancien service.
