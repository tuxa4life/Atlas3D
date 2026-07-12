import { useState } from 'react'

// Controlled when a `checked` prop is passed (state lives in the parent, so
// external toggles like hotkeys stay in sync); otherwise self-managed.
const Checkbox = ({ label, onChange = () => {}, defaultChecked = false, checked }) => {
    const [internalChecked, setInternalChecked] = useState(defaultChecked)
    const isControlled = checked !== undefined
    const value = isControlled ? checked : internalChecked

    const handleChange = (e) => {
        const newValue = e.target.checked
        if (!isControlled) setInternalChecked(newValue)
        onChange(newValue)
    }

    return (
        <label className="ui-checkbox">
            <input
                type="checkbox"
                className="ui-checkbox__box"
                checked={value}
                onChange={handleChange}
            />
            <span className="ui-checkbox__label">{label}</span>
        </label>
    )
}

export default Checkbox
