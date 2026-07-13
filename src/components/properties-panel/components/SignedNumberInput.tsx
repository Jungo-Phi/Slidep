import React from "react";
import { Box, IconButton } from "@mui/material";
import {
  RotateLeft as RotateLeftIcon,
  RotateRight as RotateRightIcon,
} from "@mui/icons-material";
import NumberInput from "./NumberInput";
import { COLORS } from "../../../constants/rendering-specs";

interface SignedNumberInputProps {
  label: string;
  /** Signed value: the magnitude is shown in the field, the sign drives the switch. */
  value: number;
  onChange: (value: number) => void;
  step?: number;
  large?: boolean;
  suffix?: string;
  accent?: boolean;
}

/**
 * Magnitude field + direction switch for a signed quantity (motor speed, moment).
 * The field always displays the magnitude; the sense of rotation is carried by
 * the switch icon alone, and a negative value typed into the field is folded
 * back into the switch.
 */
export const SignedNumberInput: React.FC<SignedNumberInputProps> = ({
  label,
  value,
  onChange,
  step,
  large,
  suffix,
  accent,
}) => {
  const clockwise = value >= 0;
  const DirectionIcon = clockwise ? RotateRightIcon : RotateLeftIcon;

  // The field shows the magnitude, but still accepts a typed sign: entering a
  // negative flips the switch rather than showing a negative number. The arrows
  // step the magnitude, so stepping below zero flips the switch too.
  const handleChange = (entered: number) => {
    const flip = entered < 0;
    const magnitude = Math.abs(entered);
    const nextClockwise = flip ? !clockwise : clockwise;
    onChange(nextClockwise ? magnitude : -magnitude);
  };

  return (
    <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
      <NumberInput
        label={label}
        value={Math.abs(value)}
        onChange={handleChange}
        step={step}
        large={large}
        suffix={suffix}
        accent={accent}
        signed={true}
      />
      <IconButton
        onClick={() => onChange(-value)}
        title={clockwise ? "Horaire" : "Anti-horaire"}
        size="small"
        sx={{
          borderRadius: 3,
          border: "1px solid",
          borderColor: accent ? COLORS.FILL_NODE : "divider",
          backgroundColor: accent
            ? COLORS.FILL_NODE + COLORS.HALF_TRANSPARENCY
            : "transparent",
          color: accent ? "primary.main" : undefined,
          "&:hover": {
            backgroundColor: accent
              ? COLORS.FILL_NODE + COLORS.HALF_TRANSPARENCY
              : "transparent",
            borderColor: accent ? "primary.main" : "text.primary",
          },
        }}
      >
        <DirectionIcon
          sx={{ fontSize: large ? "24px" : "16px" }}
          color={"secondary"}
        />
      </IconButton>
    </Box>
  );
};

export default SignedNumberInput;
