import { useState, useRef, useEffect, useCallback } from 'react'
import { searchPlacesService } from '../../services/apiService'
import { useError } from '../../Context/ErrorContext'

const SearchBar = ({ placeholder = 'Search for a city...', onSelect }) => {
    const { showError } = useError()
    const [inputValue, setInputValue] = useState('')
    const [results, setResults] = useState([])
    const [isOpen, setIsOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)

    const wrapperRef = useRef(null)
    const debounceRef = useRef(null)
    const requestIdRef = useRef(0)

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setIsOpen(false)
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    useEffect(() => () => clearTimeout(debounceRef.current), [])

    const runSearch = useCallback(async (query) => {
        const requestId = ++requestIdRef.current
        setIsLoading(true)

        const found = await searchPlacesService(query, showError)

        // Ignore responses from stale (superseded) requests.
        if (requestId !== requestIdRef.current) return

        setResults(found)
        setIsLoading(false)
        setIsOpen(true)
    }, [showError])

    const handleInputChange = (e) => {
        const value = e.target.value
        setInputValue(value)
        setIsOpen(true)

        clearTimeout(debounceRef.current)

        if (value.trim().length < 2) {
            requestIdRef.current++
            setResults([])
            setIsLoading(false)
            return
        }

        debounceRef.current = setTimeout(() => runSearch(value.trim()), 300)
    }

    const handleSelect = (option) => {
        setInputValue(option.text)
        setResults([])
        setIsOpen(false)
        if (onSelect) onSelect(option.value)
    }

    const dropdownBase = {
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        marginTop: '4px',
        backgroundColor: 'white',
        border: '1px solid #ddd',
        borderRadius: '6px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        zIndex: 1000,
    }

    return (
        <div ref={wrapperRef} style={{ position: 'relative', width: '300px', maxWidth: '100%' }}>
            <input
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                onFocus={() => setIsOpen(true)}
                placeholder={placeholder}
                style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: '14px',
                    border: '1px solid rgba(228, 228, 228, 1)',
                    borderRadius: '6px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s',
                    backgroundColor: 'rgba(255, 255, 255, .75)',
                }}
                onMouseEnter={(e) => (e.target.style.borderColor = '#999')}
                onMouseLeave={(e) => (e.target.style.borderColor = '#ddd')}
            />

            {isOpen && isLoading && (
                <div style={{ ...dropdownBase, padding: '10px 12px', fontSize: '14px', color: '#999' }}>
                    Searching...
                </div>
            )}

            {isOpen && !isLoading && results.length > 0 && (
                <div style={{ ...dropdownBase, maxHeight: '200px', overflowY: 'auto' }}>
                    {results.map((option) => (
                        <div
                            key={`${option.value.type}-${option.value.id}`}
                            onClick={() => handleSelect(option)}
                            style={{
                                padding: '10px 12px',
                                cursor: 'pointer',
                                fontSize: '14px',
                                transition: 'background-color 0.15s',
                            }}
                            onMouseEnter={(e) => (e.target.style.backgroundColor = '#f5f5f5')}
                            onMouseLeave={(e) => (e.target.style.backgroundColor = 'transparent')}
                        >
                            {option.text}
                        </div>
                    ))}
                </div>
            )}

            {isOpen && !isLoading && inputValue.trim().length >= 2 && results.length === 0 && (
                <div style={{ ...dropdownBase, padding: '10px 12px', fontSize: '14px', color: '#999' }}>
                    No results found
                </div>
            )}
        </div>
    )
}

export default SearchBar
