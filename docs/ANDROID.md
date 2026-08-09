# Compilar la app para Android (APK)

El simulador se empaqueta como app Android con [Capacitor](https://capacitorjs.com):
tus archivos web van **dentro** del APK, así que la app funciona sin internet.

La carpeta `android/` ya es un proyecto de Android Studio listo para abrir.

## Requisitos (una sola vez)

1. **Android Studio** — descárgalo de <https://developer.android.com/studio>.
   Trae su propio JDK y el SDK de Android, no necesitas instalar Java aparte.
2. Al abrir Android Studio la primera vez, deja que descargue el **Android SDK**
   que te proponga (acepta las licencias).

## Abrir el proyecto

Desde la raíz del repositorio:

```bash
npm install          # solo la primera vez (instala Capacitor)
npm run open:android # copia la web y abre Android Studio
```

Si prefieres abrirlo a mano: en Android Studio, **Open** → elige la carpeta
`android/` de este proyecto (no la raíz del repo, la subcarpeta `android`).

La primera vez Android Studio hará un **Gradle Sync** (descarga dependencias);
puede tardar unos minutos. Espera a que termine sin errores.

## Ver la app en el emulador o tu teléfono

- **Emulador:** `Device Manager` (icono de teléfono a la derecha) → `Create device`
  → elige un Pixel → descarga una imagen del sistema → `Finish`. Luego pulsa el
  botón verde **Run ▶**.
- **Tu teléfono real:** activa `Opciones de desarrollador` y `Depuración USB` en
  Android, conéctalo por cable, selecciónalo arriba y pulsa **Run ▶**.

## Generar el APK

En Android Studio:

1. Menú **Build** → **Build App Bundle(s) / APK(s)** → **Build APK(s)**.
2. Cuando termine, aparece una notificación abajo a la derecha: pulsa **locate**.
3. El archivo está en:
   `android/app/build/outputs/apk/debug/app-debug.apk`

Ese `app-debug.apk` ya se instala y ejecuta en cualquier Android. Es un APK de
**depuración** — perfecto para probar y compartir contigo mismo.

## APK/AAB firmado (para la Play Store o para distribuir)

Para publicar necesitas una versión **firmada**:

1. Menú **Build** → **Generate Signed Bundle / APK**.
2. Elige **APK** (o **Android App Bundle** si vas a la Play Store).
3. `Create new…` para generar tu **keystore** (guárdalo y su contraseña muy
   bien: sin él no podrás actualizar la app en el futuro).
4. Elige la variante **release** y **Finish**.

El resultado queda en `android/app/release/`.

## Volver a compilar tras cambiar la web

Cada vez que edites el simulador (HTML/CSS/JS), sincroniza antes de recompilar:

```bash
npm run sync:android   # copia www/ dentro del proyecto Android
```

Después, en Android Studio pulsa **Run ▶** o vuelve a **Build APK(s)**.

## Cambiar el icono y el nombre

- **Nombre visible:** `android/app/src/main/res/values/strings.xml` → `app_name`.
- **Icono:** clic derecho en `app` → **New** → **Image Asset**, elige tu imagen y
  genera los iconos. O usa [`@capacitor/assets`](https://github.com/ionic-team/capacitor-assets)
  con un PNG de 1024×1024 y un comando.
- **ID del paquete:** `com.ronnyscabello.openccna` (en `capacitor.config.json` y
  `android/app/build.gradle`). Cámbialo antes de publicar si quieres otro.
