Best Practices: Efficient Location Tracking in React Web Apps
1. Vraag alleen locatie wanneer nodig
Continu locatie ophalen is een van de grootste batterijverbruikers. Start tracking alleen wanneer de gebruiker een feature gebruikt (bijv. een kaart) en stop zodra die niet meer zichtbaar is.
Best practices
Start watchPosition() alleen wanneer de map zichtbaar is
Stop tracking bij:
component unmount
tab niet zichtbaar
gebruiker verlaat kaart
Effect: voorkomt onnodige GPS-activiteit en bespaart batterij.
2. Gebruik caching via maximumAge
De browser kan recente locaties hergebruiken in plaats van elke keer GPS te activeren.
navigator.geolocation.watchPosition(success, error, {
  maximumAge: 5000
});
Richtlijn
Use case	maximumAge
real-time map	3–10 sec
local discovery	30–60 sec
Caching vermindert het aantal GPS-queries en kan geolocatie-requests met ~30% reduceren.
3. Gebruik een distance filter (movement threshold)
Veel apps verwerken elke update terwijl de gebruiker nauwelijks beweegt.
Een betere strategie is updates alleen te verwerken wanneer de gebruiker een minimale afstand heeft afgelegd.
Typical thresholds
scenario	distance filter
navigatie	3-5 m
lopen	5-10 m
stadskaart	10-25 m
Distance-based updates verminderen het aantal updates aanzienlijk en verbeteren performance.
4. Pas update-frequentie dynamisch aan
Gebruik adaptive sampling:
situatie	update interval
stationair	30-60 s
wandelen	5-10 s
navigatie	1-3 s
Dynamische sampling kan energiegebruik met ~30% verminderen.
5. Gebruik alleen high accuracy wanneer nodig
enableHighAccuracy: true gebruikt GPS en kost aanzienlijk meer energie.
Strategie
scenario	accuracy
kaart openen	high
achtergrond	medium
stationair	low
High accuracy levert betere data maar verhoogt batterijgebruik en latency.
6. Filter slechte GPS-metingen
GPS-metingen hebben een accuracy veld.
Best practice
Negeer updates wanneer:
accuracy > 50m
Dit voorkomt:
jitter op de kaart
onnodige renders
7. Batch of throttle UI updates
GPS kan vaker updaten dan nodig voor de UI.
Gebruik:
throttle (1–2 seconden)
batching van updates
Batching van locatie-events kan netwerkverkeer en verwerking drastisch reduceren.
8. Minimaliseer React re-renders
Een kaartcomponent is vaak zwaar.
Strategieën:
update marker direct via map API
sla locatie op in een store (bijv. Zustand)
gebruik throttled state updates
Architectuur:
Geolocation API
       ↓
Location Service
(distance filter + throttle)
       ↓
State Store
       ↓
Map UI
9. Gebruik geofencing wanneer mogelijk
Als je alleen locatie nodig hebt binnen specifieke zones:
start tracking pas wanneer gebruiker zone nadert
stop tracking buiten zones
Geofencing kan tot 50% energie besparen vergeleken met continu tracken.
10. Respecteer lifecycle van de app
Veel batterijproblemen ontstaan doordat locatie-updates blijven draaien.
Stop updates bij
tab hidden
component unmount
gebruiker pauzeert tracking
Het niet verwijderen van location listeners is een bekende oorzaak van batterijverbruik.
Recommended production configuration
Voor een realtime map met gebruikerspositie:
accuracy: high
distanceFilter: 10 m
renderThrottle: 1–2 s
maximumAge: 5 s
stationaryInterval: 30 s
Dit reduceert vaak 80-95% van de updates zonder dat de kaart onnauwkeurig wordt.
Samenvatting (de 6 belangrijkste optimalisaties)
Track alleen wanneer nodig
Gebruik caching (maximumAge)
Filter updates op afstand (5–20m)
Throttle UI renders (1–2s)
Pas accuracy en interval dynamisch aan
Stop tracking wanneer UI niet actief is
Samen zorgen deze technieken voor:
lagere CPU-load
minder React renders
aanzienlijk minder batterijverbruik.
💡 Als je wilt kan ik ook een production-ready React hook (useSmartGeolocation) ontwerpen die al deze optimalisaties combineert.
Dat is ongeveer hoe Uber, Strava en Google Maps hun location pipelines structureren. Dat scheelt een hoop trial-and-error.