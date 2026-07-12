import { useState } from 'react'

const Checkbox = ({ label, onChange = () => {}, defaultChecked = false }) => {
    const [checked, setChecked] = useState(defaultChecked)

    const handleChange = (e) => {
        const newValue = e.target.checked
        setChecked(newValue)
        onChange(newValue)
    }

    return (
        <label className="ui-checkbox">
            <input
                type="checkbox"
                className="ui-checkbox__box"
                checked={checked}
                onChange={handleChange}
            />
            <span className="ui-checkbox__label">{label}</span>
        </label>
    )
}

export default Checkbox
