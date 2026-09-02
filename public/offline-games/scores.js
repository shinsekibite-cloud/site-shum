(function () {
  var BEST_KEY = 'yp-game-best';
  var QUEUE_KEY = 'yp-game-score-queue';

  function readMap(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || '{}');
    } catch (e) {
      return {};
    }
  }

  function writeMap(key, map) {
    try {
      localStorage.setItem(key, JSON.stringify(map));
    } catch (e) {}
  }

  window.YPGames = {
    getBest: function (game) {
      var map = readMap(BEST_KEY);
      return Number(map[game] || 0) || 0;
    },
    setBest: function (game, score) {
      var map = readMap(BEST_KEY);
      map[game] = Math.max(Number(map[game] || 0), score);
      writeMap(BEST_KEY, map);
      return map[game];
    },
    report: function (opts) {
      var game = opts.game;
      var score = Math.max(0, Math.floor(Number(opts.score) || 0));
      this.setBest(game, score);
      var payload = {
        game: game,
        score: score,
        event: opts.event || 'score',
        meta: opts.meta || undefined,
        at: Date.now(),
      };
      function enqueue() {
        try {
          var list = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
          list.push(payload);
          localStorage.setItem(QUEUE_KEY, JSON.stringify(list.slice(-40)));
        } catch (e) {}
      }
      if (!navigator.onLine) {
        enqueue();
        return;
      }
      fetch('/api/user/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      }).catch(enqueue);
    },
  };
})();
