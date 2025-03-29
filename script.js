import { useState, useEffect } from "react";
import { Chessboard } from "react-chessboard";
import { Chess } from "chess.js";

export default function ChessGame() {
  const [game, setGame] = useState(new Chess());
  const [history, setHistory] = useState([]);
  const [time, setTime] = useState({ white: 300, black: 300 }); // الوقت الافتراضي 5 دقائق
  const [turn, setTurn] = useState("w"); // الدور: w للأبيض، b للأسود
  const [gameType, setGameType] = useState("pvp"); // نوع اللعبة: pvp أو pve
  const [difficulty, setDifficulty] = useState(1); // مستوى الصعوبة من 1 إلى 8
  const [gameTime, setGameTime] = useState(5); // وقت اللعب بالدقائق
  const [playerColor, setPlayerColor] = useState("random"); // اختيار لون اللاعب
  const [gameStarted, setGameStarted] = useState(false); // حالة بدء اللعبة
  const [message, setMessage] = useState(""); // رسائل اللعبة
  const [gameOver, setGameOver] = useState(false); // حالة انتهاء اللعبة
  const [stockfish, setStockfish] = useState(null); // محرك Stockfish
  const [elo, setElo] = useState({ white: 1200, black: 1200 }); // تقييم Elo

  // تهيئة محرك Stockfish
  useEffect(() => {
    const engine = new Worker("/stockfish.js");
    engine.onmessage = handleStockfishMessage;
    setStockfish(engine);
    return () => engine.terminate();
  }, []);

  // تحديث الوقت كل ثانية
  useEffect(() => {
    if (!gameStarted || gameOver) return;
    const timer = setInterval(() => {
      setTime((prevTime) => {
        if (prevTime.white <= 0 || prevTime.black <= 0) {
          setGameOver(true);
          setMessage("انتهى الوقت! اللعبة انتهت.");
          updateElo(prevTime.white <= 0 ? "b" : "w"); // تحديث Elo بناءً على الفائز
          return prevTime;
        }
        return {
          white: turn === "w" ? Math.max(prevTime.white - 1, 0) : prevTime.white,
          black: turn === "b" ? Math.max(prevTime.black - 1, 0) : prevTime.black,
        };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [turn, gameStarted, gameOver]);

  // بدء لعبة جديدة
  const startNewGame = () => {
    const newGame = new Chess();
    setGame(newGame);
    setHistory([]);
    const timeInSeconds = gameTime * 60; // تحويل الوقت إلى ثوانٍ
    setTime({ white: timeInSeconds, black: timeInSeconds });
    setMessage("");
    setGameOver(false);

    let chosenColor = playerColor;
    if (playerColor === "random") {
      chosenColor = Math.random() > 0.5 ? "w" : "b";
    }
    setTurn("w"); // الأبيض يبدأ دائمًا
    setGameStarted(true);

    if (gameType === "pve" && chosenColor === "b") {
      setTimeout(makeAIMove, 500); // الذكاء الاصطناعي يبدأ إذا اختار اللاعب الأسود
    }
  };

  // حركة الذكاء الاصطناعي
  const makeAIMove = () => {
    if (!stockfish || gameOver) return;
    stockfish.postMessage(`position fen ${game.fen()}`);
    const depth = difficulty * 2; // ضبط عمق البحث بناءً على مستوى الصعوبة
    stockfish.postMessage(`go depth ${depth}`);
  };

  // معالجة رسائل Stockfish
  const handleStockfishMessage = (event) => {
    if (event.data.includes("bestmove")) {
      const bestMove = event.data.split(" ")[1];
      if (!bestMove || bestMove === "(none)") return;
      setGame((prevGame) => {
        const newGame = new Chess(prevGame.fen());
        const move = newGame.move({
          from: bestMove.substring(0, 2),
          to: bestMove.substring(2, 4),
          promotion: "q",
        });
        if (move) {
          setHistory([...history, move.san]);
          setTurn(newGame.turn());
          checkGameState(newGame);
          return new Chess(newGame.fen());
        }
        return prevGame;
      });
    }
  };

  // معالجة حركات اللاعب
  const onDrop = (sourceSquare, targetSquare) => {
    if (!gameStarted || gameOver) return false;
    setGame((prevGame) => {
      const newGame = new Chess(prevGame.fen());
      const move = newGame.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: "q",
      });
      if (!move) {
        setMessage("حركة غير قانونية!");
        return prevGame;
      }
      setHistory([...history, move.san]);
      setTurn(newGame.turn());
      checkGameState(newGame);
      if (gameType === "pve" && newGame.turn() === (playerColor === "w" ? "b" : "w")) {
        setTimeout(makeAIMove, 500); // استدعاء حركة الذكاء الاصطناعي
      }
      return new Chess(newGame.fen());
    });
    return true;
  };

  // التحقق من حالة اللعبة
  const checkGameState = (newGame) => {
    if (newGame.isCheckmate()) {
      setMessage("كش مات! انتهت اللعبة.");
      setGameOver(true);
      updateElo(turn === "w" ? "b" : "w"); // تحديث Elo للفائز
    } else if (newGame.isDraw() || newGame.isStalemate() || newGame.isThreefoldRepetition()) {
      setMessage("تعادل! اللعبة انتهت بالتعادل.");
      setGameOver(true);
    } else if (newGame.inCheck()) {
      setMessage("كش!");
    } else {
      setMessage("");
    }
  };

  // تحديث تقييم Elo
  const updateElo = (winner) => {
    const k = 32; // عامل التغيير
    const expectedWhite = 1 / (1 + 10 ** ((elo.black - elo.white) / 400));
    const expectedBlack = 1 / (1 + 10 ** ((elo.white - elo.black) / 400));

    setElo((prevElo) => {
      if (winner === "w") {
        return {
          white: prevElo.white + k * (1 - expectedWhite),
          black: prevElo.black + k * (0 - expectedBlack),
        };
      } else if (winner === "b") {
        return {
          white: prevElo.white + k * (0 - expectedWhite),
          black: prevElo.black + k * (1 - expectedBlack),
        };
      }
      return prevElo;
    });
  };

  return (
    <div className="flex flex-col items-center p-4 bg-gray-900 text-white min-h-screen">
      <h1 className="text-2xl font-bold mb-4">ملك الشطرنج GM</h1>
      <p className="mb-4">تقييم Elo - الأبيض: {Math.round(elo.white)} | الأسود: {Math.round(elo.black)}</p>
      {!gameStarted ? (
        <div className="flex flex-col items-center">
          <select
            value={gameType}
            onChange={(e) => setGameType(e.target.value)}
            className="mb-4 p-2 border rounded bg-gray-700 text-white"
          >
            <option value="pvp">اللعب مع الأصدقاء</option>
            <option value="pve">اللعب ضد الذكاء الاصطناعي</option>
          </select>
          {gameType === "pve" && (
            <>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(Number(e.target.value))}
                className="mb-4 p-2 border rounded bg-gray-700 text-white"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((level) => (
                  <option key={level} value={level}>
                    مستوى {level}
                  </option>
                ))}
              </select>
              <select
                value={playerColor}
                onChange={(e) => setPlayerColor(e.target.value)}
                className="mb-4 p-2 border rounded bg-gray-700 text-white"
              >
                <option value="white">ألعب بالأبيض</option>
                <option value="black">ألعب بالأسود</option>
                <option value="random">عشوائي</option>
              </select>
            </>
          )}
          <select
            value={gameTime}
            onChange={(e) => setGameTime(Number(e.target.value))}
            className="mb-4 p-2 border rounded bg-gray-700 text-white"
          >
            {[5, 10, 15, 30, 60].map((time) => (
              <option key={time} value={time}>
                {time} دقائق
              </option>
            ))}
          </select>
          <button
            onClick={startNewGame}
            className="p-2 bg-green-500 text-white rounded hover:bg-green-600 transition"
          >
            ابدأ اللعب
          </button>
        </div>
      ) : (
        <>
          <Chessboard position={game.fen()} onPieceDrop={onDrop} boardWidth={400} />
          <div className="mt-4">
            <p>وقت الأبيض: {Math.floor(time.white / 60)}:{(time.white % 60).toString().padStart(2, "0")}</p>
            <p>وقت الأسود: {Math.floor(time.black / 60)}:{(time.black % 60).toString().padStart(2, "0")}</p>
          </div>
          {message && <div className="mt-4 text-lg font-bold text-red-500">{message}</div>}
        </>
      )}
    </div>
  );
}
