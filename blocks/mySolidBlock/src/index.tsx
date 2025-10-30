/* Entry point for mySolidBlock - SolidJS */
import { render } from 'solid-js/web'
import App from './App'

const root = document.getElementById('root')!
render(() => <App />, root)

// Export default for potential embedding usage if needed
export default App
