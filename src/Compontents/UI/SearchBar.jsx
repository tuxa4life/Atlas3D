import { useState, useRef, useEffect, useCallback } from 'react'
import { searchPlacesService } from '../../services/apiService'
import { useError } from '../../Context/ErrorContext'

const LISTBOX_ID = 'city-search-listbox'

const SearchBar = ({ placeholder = 'Search for a city...', onSelect, autoFocus = false }) => {
    const { showError } = useError()
    const [inputValue, setInputValue] = useState('')
    const [results, setResults] = useState([])
    const [isOpen, setIsOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [activeIndex, setActiveIndex] = useState(-1)

    const wrapperRef = useRef(null)
    const listRef = useRef(null)
    const inputRef = useRef(null)
    const debounceRef = useRef(null)
    const requestIdRef = useRef(0)

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setIsOpen(false)
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    useEffect(() => {
        if (autoFocus) inputRef.current?.focus()
    }, [autoFocus])

    useEffect(() => () => clearTimeout(debounceRef.current), [])

    // Keep the highlighted option scrolled into view.
    useEffect(() => {
        if (activeIndex < 0 || !listRef.current) return
        const el = listRef.current.children[activeIndex]
        if (el) el.scrollIntoView({ block: 'nearest' })
    }, [activeIndex])

    const runSearch = useCallback(async (query) => {
        const requestId = ++requestIdRef.current
        setIsLoading(true)

        const found = await searchPlacesService(query, showError)

        // Ignore responses from stale (superseded) requests.
        if (requestId !== requestIdRef.current) return

        setResults(found)
        setActiveIndex(-1)
        setIsLoading(false)
        setIsOpen(true)
    }, [showError])

    const handleInputChange = (e) => {
        const value = e.target.value
        setInputValue(value)
        setIsOpen(true)
        setActiveIndex(-1)

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
        setActiveIndex(-1)
        setIsOpen(false)
        if (onSelect) onSelect(option.value)
    }

    const handleKeyDown = (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault()
            if (!isOpen) setIsOpen(true)
            if (results.length) setActiveIndex((i) => (i + 1) % results.length)
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            if (results.length) setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1))
        } else if (e.key === 'Enter') {
            if (activeIndex >= 0 && results[activeIndex]) {
                e.preventDefault()
                handleSelect(results[activeIndex])
            }
        } else if (e.key === 'Escape') {
            setIsOpen(false)
            setActiveIndex(-1)
        }
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

    const showResults = isOpen && !isLoading && results.length > 0
    const showEmpty = isOpen && !isLoading && inputValue.trim().length >= 2 && results.length === 0

    return (
        <div ref={wrapperRef} style={{ position: 'relative', width: '300px', maxWidth: '100%' }}>
            <input
                ref={inputRef}
                type="text"
                className="city-search-input"
                role="combobox"
                aria-expanded={showResults}
                aria-controls={LISTBOX_ID}
                aria-autocomplete="list"
                aria-activedescendant={activeIndex >= 0 ? `${LISTBOX_ID}-opt-${activeIndex}` : undefined}
                value={inputValue}
                onChange={handleInputChange}
                onFocus={() => setIsOpen(true)}
                onKeyDown={handleKeyDown}
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

            {showResults && (
                <div
                    ref={listRef}
                    id={LISTBOX_ID}
                    role="listbox"
                    style={{ ...dropdownBase, maxHeight: '200px', overflowY: 'auto' }}
                >
                    {results.map((option, index) => (
                        <div
                            key={`${option.value.type}-${option.value.id}`}
                            id={`${LISTBOX_ID}-opt-${index}`}
                            role="option"
                            aria-selected={index === activeIndex}
                            onClick={() => handleSelect(option)}
                            onMouseEnter={() => setActiveIndex(index)}
                            style={{
                                padding: '10px 12px',
                                cursor: 'pointer',
                                fontSize: '14px',
                                backgroundColor: index === activeIndex ? '#f5f5f5' : 'transparent',
                            }}
                        >
                            {option.text}
                        </div>
                    ))}
                </div>
            )}

            {showEmpty && (
                <div style={{ ...dropdownBase, padding: '10px 12px', fontSize: '14px', color: '#999' }}>
                    No results found
                </div>
            )}
        </div>
    )
}

export default SearchBar
