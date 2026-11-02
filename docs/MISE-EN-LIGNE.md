# Mise en ligne pas à pas

But : l'appli disponible sur **https://teranga-nas.synology.me:8444**, installée sur l'écran d'accueil du téléphone.
Même recette que le jeu Gorgée (port 8443), avec le port **3011** côté NAS et **8444** côté Internet.

L'appli est indépendante : **ne l'ajoute pas au portail KalooFlix**.

---

## 1. Mettre le code sur GitHub

Le conteneur récupère le code depuis GitHub à chaque démarrage. Le dépôt doit être **public** (il ne contient aucun secret : les jetons et mots de passe sont seulement dans Container Manager).

1. Sur github.com, crée le dépôt **`Repax`** (public, sans README).
2. Dans le dossier du projet :

```bash
git remote add origin https://github.com/Kaloomc/Repax.git
```

```bash
git push -u origin main
```

---

## 2. Préparer Notion (facultatif, sinon mode démo)

1. Va sur https://www.notion.so/profile/integrations → **Nouvelle intégration**.
   - Nom : `Gestion des repas`, espace de travail : le tien, type : **Interne**.
   - Copie le **jeton secret** (il commence par `ntn_`). C'est `NOTION_TOKEN`. Ne le mets jamais dans le code ni sur GitHub.
2. Dans Notion, crée une page vide **« Gestion des repas »**.
3. Sur cette page : menu **•••** en haut à droite → **Connexions** → ajoute **Gestion des repas** (ton intégration). Sans ça, l'appli ne voit pas la page.
4. Copie le lien de la page (**•••** → **Copier le lien**). L'identifiant, ce sont les 32 caractères à la fin :
   `https://www.notion.so/Gestion-des-repas-`**`1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d`** → c'est `NOTION_PAGE_ID`.

Au premier démarrage, l'appli crée toute seule les 5 bases dans cette page, avec les recettes d'exemple.

---

## 3. Créer le projet dans Container Manager

1. **File Station** → dossier `docker` → crée un dossier **`gestion-repas`** (laisse-le vide).
2. **Container Manager** → **Projet** → **Créer** :
   - Nom du projet : `gestion-repas`
   - Chemin : `/docker/gestion-repas`
   - Source : **Créer un fichier docker-compose.yml**
3. Colle le contenu de [`docker-compose.yml`](../docker-compose.yml) et remplis les 3 lignes :
   - `NOTION_TOKEN=ntn_...` (ou vide pour le mode démo)
   - `NOTION_PAGE_ID=1a2b3c...`
   - `APP_PASSWORD=` un mot de passe à toi (**à mettre** : sans lui, n'importe qui sur Internet pourrait voir et modifier tes données)
4. **Suivant** → (pas besoin de Web Station) → **Terminé**. Le projet démarre.
5. Vérifie : **Conteneur** → `gestion-repas` → **Journal**. Tu dois voir à la fin :
   `Gestion des repas sur http://localhost:3011 (mode notion)`
   Le premier démarrage prend 1 à 2 minutes (téléchargement de git et des dépendances).

Test sur le réseau de la maison : http://192.168.1.45:3011

---

## 4. Proxy inversé HTTPS (port 8444)

**Panneau de configuration** → **Portail de connexion** → **Avancé** → **Proxy inversé** → **Créer** :

| | Source | Destination |
|---|---|---|
| Protocole | HTTPS | HTTP |
| Nom d'hôte | `teranga-nas.synology.me` | `localhost` |
| Port | `8444` | `3011` |

Nom de la règle : `gestion-repas`. Coche **Activer HSTS** si tu veux (comme pour Gorgée).
Pas besoin des en-têtes WebSocket ici (l'appli n'en utilise pas), mais les ajouter ne gêne pas.

---

## 5. Certificat

**Panneau de configuration** → **Sécurité** → **Certificat** → **Paramètres** :
pour le service **`teranga-nas.synology.me:8444`** (la règle du proxy), choisis le certificat **teranga-nas.synology.me** → **OK**.

---

## 6. Ouvrir le port sur la Freebox

1. Va sur http://mafreebox.freebox.fr → **Paramètres de la Freebox** → **Mode avancé** → **Gestion des ports**.
2. **Ajouter une redirection** :
   - IP de destination : `192.168.1.45`
   - Redirection active : oui
   - IP source : toutes
   - Protocole : **TCP**
   - Port de début / fin : `8444`
   - Port de destination : `8444`
3. **Sauvegarder**.

Si le **pare-feu DSM** est activé (**Panneau de configuration** → **Sécurité** → **Pare-feu**), autorise aussi le port TCP **8444**, comme pour 8443.

Test depuis le téléphone **en 4G (Wi-Fi coupé)** : https://teranga-nas.synology.me:8444 → l'écran de connexion s'affiche.

---

## 7. Mettre l'appli sur l'écran d'accueil

### iPhone (avec Safari, obligatoirement)
1. Ouvre https://teranga-nas.synology.me:8444 dans **Safari** et connecte-toi.
2. Bouton **Partager** (carré avec une flèche vers le haut).
3. **Sur l'écran d'accueil** → nom : `Repas` → **Ajouter**.

### Android (avec Chrome)
1. Ouvre https://teranga-nas.synology.me:8444 dans **Chrome** et connecte-toi.
2. Menu **⋮** → **Installer l'application** (ou **Ajouter à l'écran d'accueil**) → **Installer**.

L'icône verte « Repas » apparaît ; l'appli s'ouvre en plein écran, sans la barre du navigateur. La dernière liste de courses affichée reste lisible au magasin même sans réseau.

---

## 8. Mettre à jour l'appli

1. Pousse les changements sur GitHub (`git push`).
2. **Container Manager** → **Projet** → `gestion-repas` → **Action** → **Redémarrer** (ou Arrêter puis Démarrer).
Au redémarrage, le conteneur récupère la dernière version.

Pour changer un mot de passe ou un jeton : **Projet** → `gestion-repas` → **Arrêter** → **Modifier** le YAML → **Enregistrer** → **Démarrer**.

---

## Dépannage

| Problème | Piste |
|---|---|
| Le journal affiche `Notion : Could not find block` | La page n'est pas connectée à l'intégration (étape 2.3), ou `NOTION_PAGE_ID` est faux |
| `Notion : API token is invalid` | `NOTION_TOKEN` mal copié |
| La page ne s'ouvre pas depuis la 4G | Redirection Freebox (étape 6) ou pare-feu DSM |
| Avertissement de certificat | Étape 5 : le certificat n'est pas associé au port 8444 |
| « Recette illisible » ou recherche vide | Marmiton a sans doute changé son site : les recettes déjà enregistrées marchent toujours |
| `fatal: detected dubious ownership` | La ligne `safe.directory` manque dans la commande du YAML |
