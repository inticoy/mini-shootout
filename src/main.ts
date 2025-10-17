import './style.css';
import { MiniShootout } from './game';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
const scoreElement = document.getElementById('score') as HTMLDivElement | null;

if (!canvas || !scoreElement) {
  throw new Error('필수 DOM 요소를 찾을 수 없습니다.');
}

const scoreDisplay = scoreElement;

function updateScore(score: number) {
  scoreDisplay.textContent = score.toString();
  scoreDisplay.classList.add('score-changed');
  setTimeout(() => {
    scoreDisplay.classList.remove('score-changed');
  }, 300);
}

new MiniShootout(canvas, updateScore);

console.log('⚽ Mini Shootout Ready');
console.log('손가락이나 마우스로 아래 공을 위로 튕겨 골대에 넣어보세요!');
