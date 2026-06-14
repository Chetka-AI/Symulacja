# NeuroLife 🧬

Mobilna (przeglądarkowa) symulacja rozwoju życia oparta o **neuroewolucję** —
komórki uczą się szukać pokarmu metodą uczenia maszynowego w sieciach
neuronowych, bez żadnych zależności zewnętrznych (czysty JS/HTML/CSS).

## Jak uruchomić

Otwórz `index.html` w przeglądarce (najlepiej w widoku mobilnym).
Nie wymaga serwera ani instalacji — działa też offline.

Opcjonalnie lokalny serwer:

```bash
python3 -m http.server 8000
# następnie otwórz http://localhost:8000 na telefonie/w przeglądarce
```

## Jak to działa

- **Świat** — mała, toroidalna mapa. Pokarm pojawia się w losowych, ale
  **stałych** miejscach i **regeneruje się tam, gdzie został zjedzony**
  (po ustawionym czasie).
- **Komórki** — każda ma „mózg" (sieć neuronowa) i poziom energii. Poruszają
  się, zużywają energię, a jedząc pokarm ją odzyskują. Gdy energia spadnie do
  zera — komórka ginie. Kolor obrazuje energię (czerwony = głód, zielony = syta).
- **Sensory (5 wejść sieci):** bliskość najbliższego pokarmu, kierunek do
  pokarmu (sin/cos względem kierunku ruchu), poziom energii, stała.
- **Wyjścia (2):** skręt i prędkość.
- **Neuroewolucja** — cała populacja rywalizuje w jednym świecie. Po każdym
  pokoleniu następuje selekcja (turniejowa + elita), krzyżowanie i mutacja
  genomów (spłaszczone wagi sieci).

## Panel sterowania

Przed uruchomieniem możesz ustawić:

- **Sieć neuronowa:** liczba warstw ukrytych, neurony na warstwę, funkcja
  aktywacji (tanh / sigmoid / ReLU).
- **Trening:** wielkość populacji, liczba pokoleń, kroki na pokolenie,
  współczynnik i siła mutacji, odsetek elity.
- **Świat:** rozmiar mapy, ilość pokarmu, czas regeneracji, ziarno losowości
  (powtarzalność treningu).

W trakcie: regulacja tempa, tryb **Turbo** (najszybszy trening bez animacji),
pauza/stop oraz pasek postępu.

## Analiza po treningu

- Wykresy fitnessu (najlepszy / średni / najgorszy) przez pokolenia.
- Suma zjedzonego pokarmu w populacji.
- Różnorodność genetyczna (zbieżność populacji).
- Karty podsumowania i eksport pełnych danych do JSON.

## Struktura

```
index.html        # struktura widoków (Ustawienia / Symulacja / Analiza)
css/styles.css    # styl mobile-first (ciemny motyw)
js/rng.js         # deterministyczny RNG (ziarno)
js/nn.js          # sieć neuronowa feed-forward (genom = wagi)
js/world.js       # świat, komórki, pokarm, sensory, fizyka
js/evolution.js   # neuroewolucja: selekcja / krzyżowanie / mutacja
js/charts.js      # wykresy liniowe na canvas
js/ui.js          # panel, renderowanie świata i analizy
js/app.js         # pętla treningu i sterowanie
```
