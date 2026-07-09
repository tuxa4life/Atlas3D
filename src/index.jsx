import { createRoot } from 'react-dom/client'
import App from './App'
import { DataProvider } from './Context/DataContext'
import { ErrorProvider } from './Context/ErrorContext'

const root = createRoot(document.getElementById('root'))
root.render(
    <ErrorProvider>
        <DataProvider>
            <App />
        </DataProvider>
    </ErrorProvider>
)
