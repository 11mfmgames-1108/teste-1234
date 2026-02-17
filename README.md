# Pac-Man 3D Infinito

Um mini-jogo em **Three.js** com mapa procedural infinito e progressão de dificuldade.

## O que tem no jogo

- Mundo em 3D com chunks gerados dinamicamente.
- Pac-Man controlável por `WASD` ou setas.
- Pastilhas normais (pontuação) e **pastilhas de poder** (modo POWER).
- Fantasmas com comportamento adaptativo e quantidade crescente conforme pontuação.
- Sistema de vidas, combo, game over e reinício rápido.
- Skybox procedural simples com estrelas para aumentar ambientação.

## Melhorias de estabilidade e bugs corrigidos

- Remoção de pastilhas ao descarregar chunks (evita acúmulo infinito em memória).
- Janela de invulnerabilidade após levar dano (evita perder várias vidas em sequência no mesmo contato).
- Ajuste da lógica de caminhos para coordenadas negativas (`safeMod`) na geração procedural.

## Como rodar

Como usa módulos ES no navegador, rode um servidor local:

```bash
python3 -m http.server 8000
```

Depois abra `http://localhost:8000`.

## Controles

- **Mover:** `WASD` / setas
- **Reiniciar:** `R`

## Dica

Ao coletar uma pastilha azul (POWER), os fantasmas ficam vulneráveis por alguns segundos e você ganha pontos extras ao encostar neles.
