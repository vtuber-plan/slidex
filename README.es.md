# SlideX

[English](README.md) | [简体中文](README.zh-CN.md) | [日本語](README.ja.md) | [Español](README.es.md)

SlideX es un lenguaje de presentaciones y un editor basado en documentos `.slx` legibles. Combina un DSL XML acotado, un editor visual de escritorio y navegador, un visor compartido y exportación a PNG, PDF, HTML y PPTX. El documento sigue siendo la fuente original tanto si una persona edita en el lienzo como si un script o un asistente de IA propone cambios.

## ¿Por qué existe SlideX?

Generar un PPTX mediante un script no equivale a saber qué verá el público. El script puede colocar formas y texto, pero los saltos de línea, las fuentes, la composición y las funciones no compatibles aún requieren una inspección visual. Además, editar directamente el PPTX generado dificulta incorporar esos cambios en la siguiente ejecución del script. Las bibliotecas de PPTX nativo son útiles cuando la edición de objetos en Office es la prioridad. SlideX aborda los casos que también necesitan una fuente legible, cambios repetibles y un ciclo de revisión visual.

HTML/CSS resuelve la representación en el navegador, pero un DOM y CSS arbitrarios son demasiado amplios como formato delimitado para intercambiar objetos de diapositivas. El XML de SlideX describe diapositivas, identificadores estables, geometría, temas, grupos y destinos de animación. Las etiquetas expresan jerarquía, los atributos expresan parámetros y un subconjunto controlado de texto enriquecido expresa el contenido. Se puede validar, formatear, comparar y modificar por ID. No es un documento HTML arbitrario.

```text
.slx + medios locales
       │
       └── análisis / validación → modelo compartido de diapositivas
                                   ├── render HTML/SVG → editor, visor, PNG, PDF, PPTX como imagen
                                   └── conversión a objetos nativos → PPTX editable + informe
```

El editor y el visor comparten la misma ruta de renderizado. Una IA puede generar o modificar XML, validarlo, renderizar páginas concretas como imágenes, inspeccionarlas y repetir el proceso antes de exportar. El PPTX editable implica otra decisión: el contenido compatible se convierte en objetos de Office, el contenido complejo puede convertirse en imágenes y las fuentes o los saltos de línea pueden variar. SlideX documenta estas degradaciones en el informe de exportación; no promete fidelidad visual y editabilidad total a la vez.

## Un documento .slx

```xml
<deck version="1" title="Revisión trimestral" width="960" height="540">
  <slide id="summary" background="#FFFFFF">
    <text id="headline" x="64" y="56" w="832" h="72" font-size="40" color="#172033">
      <p><strong>Revisión trimestral</strong></p>
    </text>
    <shape id="accent" name="rect" x="64" y="152" w="200" h="8" fill="#0C7B85"/>
    <text id="takeaway" x="64" y="192" w="760" h="160" font-size="28">
      <p>Una conclusión clara respaldada por datos.</p>
    </text>
  </slide>
</deck>
```

Un proyecto puede ser un solo archivo `.slx` o un archivo de entrada con páginas incluidas y recursos locales en `media/`. Conserva toda la carpeta al trasladarlo. El lenguaje también incluye patrones maestros, tablas, gráficos, imágenes, formas, fórmulas, código, temas, grupos y animaciones. Consulta la [especificación](docs/spec.md) y la [guía de proyectos multifichero](docs/large-projects.md). También puedes editar visualmente sin escribir XML.

## Instalación y uso

Instala el CLI y el editor de navegador desde el paquete npm con ámbito. CI utiliza Node.js 22; el paquete declara compatibilidad con Node.js 18 o superior. Las versiones candidatas actuales se publican bajo `next`. El paquete npm sin ámbito llamado `slidex` pertenece a otro proyecto.

```sh
npm install -g @xiahan/slidex@next
slidex version
slidex init my-deck
slidex validate my-deck/deck.slx --json
slidex serve my-deck/deck.slx
```

`serve` inicia el editor local y normalmente abre el navegador. En otra terminal, `slidex present my-deck/deck.slx` abre el visor. Para inspeccionar y exportar:

```sh
slidex format my-deck/deck.slx --check
slidex format my-deck/deck.slx --write
slidex inspect my-deck/deck.slx
slidex export my-deck/deck.slx -f png --pages 1 --manifest --json
slidex export my-deck/deck.slx -f pptx --editable --json
```

`--check` solo comprueba el formato; `--write` modifica el archivo indicado. `inspect` muestra la versión del proyecto y los ID. Antes de aplicar cambios incrementales sujetos a versión, prueba `slidex patch <deck.slx> <patch.json> --dry-run`; consulta el [protocolo de parches](docs/ai-patch.md). `slidex language <deck.slx> --offset N` ofrece datos para completar y localizar definiciones.

Para renderizar PNG/PDF/PPTX se necesita Chrome, Edge o Chromium instalado. Define `CHROME_PATH` si no se detecta automáticamente. El CLI escribe las exportaciones en `out/` junto al documento. `--pages` y `--manifest` solo se aplican a PNG; PDF y PPTX exportan actualmente la presentación completa. Revisa el informe `.report.json` de cada exportación para detectar fuentes ausentes y conversiones.

Descarga el editor/visor Electron para Windows, macOS o Linux desde [GitHub Releases](https://github.com/vtuber-plan/slidex/releases). El paquete npm **no instala** Electron. Las compilaciones de escritorio actuales no están firmadas ni notarizadas, por lo que el sistema operativo puede mostrar advertencias.

### Elegir el formato de exportación

| Formato | Uso | Límite principal |
| --- | --- | --- |
| PNG | Vista previa, revisión visual, imágenes para una IA | Imagen estática; admite rango de páginas y manifiesto |
| PDF | Compartir o imprimir | Resultado estático; las fuentes pueden alterar la composición |
| HTML | Reproductor independiente en el navegador | Los medios remotos del usuario pueden requerir red |
| PPTX | Entrega centrada en el aspecto visual | Por defecto, cada página es una imagen; sus objetos no son editables |
| PPTX `--editable` | Editar objetos compatibles en PowerPoint | Mezcla objetos nativos e imágenes; Office puede mostrar diferencias |

Las exportaciones estáticas muestran el estado visual final, no todas las animaciones del visor. Consulta los [límites de fidelidad](docs/export-reliability.md).

## Instalar la Skill de IA

La [Skill de SlideX](skills/slidex/SKILL.md) guía a un agente en la creación del DSL, validación, formato, revisión de imágenes por página e interpretación de informes. Contiene instrucciones, **no el ejecutable CLI**. Instala `@xiahan/slidex@next` por separado y descarga `slidex-skill-<versión>.zip` desde [GitHub Releases](https://github.com/vtuber-plan/slidex/releases). El ZIP ya contiene `slidex/SKILL.md` y sus referencias.

En una configuración habitual de Codex, extrae el ZIP en `$CODEX_HOME/skills`, o en `~/.codex/skills` si no existe `CODEX_HOME`. Ejemplo con el ZIP de rc.9:

```sh
mkdir -p ~/.codex/skills
unzip slidex-skill-1.7.0-rc.9.zip -d ~/.codex/skills
# ~/.codex/skills/slidex/SKILL.md
```

En Windows PowerShell, el destino habitual es `$env:USERPROFILE\.codex\skills`:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.codex\skills" | Out-Null
Expand-Archive .\slidex-skill-1.7.0-rc.9.zip -DestinationPath "$env:USERPROFILE\.codex\skills"
```

Para otros agentes, coloca la carpeta `slidex/` en su directorio de skills. También puedes usar [`skills/slidex/`](skills/slidex/) desde el repositorio. Inicia una sesión nueva si el agente solo descubre skills al arrancar. Instalar el paquete npm no registra la Skill automáticamente.

## Desarrollo desde el código fuente

```sh
npm ci
npm run build
npm run app          # Aplicación Electron de desarrollo
npm test
npm run dist:tools   # CLI tgz y Skill ZIP en release/<versión>/
npm run test:tools -- --render
```

El editor React utiliza Tailwind CSS, Radix Themes, ProseMirror y el motor compartido de renderizado y reproducción. Una etiqueta de versión inicia pruebas, compilación Electron multiplataforma, GitHub Release y npm Trusted Publishing. Más información: [arquitectura](docs/architecture.md), [publicación](docs/releasing.md), [ejemplos](examples/) y [hoja de ruta](docs/roadmap.md).

## Licencia

MIT
