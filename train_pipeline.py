import os
import sys

# 1. Check dependencies
missing_packages = []
try:
    import pandas as pd
except ImportError:
    missing_packages.append("pandas")
try:
    import numpy as np
except ImportError:
    missing_packages.append("numpy")
try:
    import sklearn
    from sklearn.preprocessing import StandardScaler
    from sklearn.model_selection import train_test_split
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.metrics import classification_report, confusion_matrix
except ImportError:
    missing_packages.append("scikit-learn")
try:
    import matplotlib.pyplot as plt
    import seaborn as sns
except ImportError:
    missing_packages.append("matplotlib")
    missing_packages.append("seaborn")

m2c_available = True
try:
    import m2cgen as m2c
except ImportError:
    m2c_available = False

if missing_packages:
    print("Error: Missing required Python packages!")
    print(f"Please install the missing dependencies: pip install {' '.join(missing_packages)}")
    if not m2c_available:
        print("Note: 'm2cgen' is also highly recommended for C-code export: pip install m2cgen")
    sys.exit(1)

# 2. Locate dataset
dataset_candidates = ['Soil data.txt', 'soil_dataset.csv', 'Soil_data.txt']
dataset_path = None
for candidate in dataset_candidates:
    if os.path.exists(candidate):
        dataset_path = candidate
        break

if not dataset_path:
    print(f"Error: Could not find dataset file. Looked for: {', '.join(dataset_candidates)}")
    print("Please place the dataset file in the same directory as this script.")
    sys.exit(1)

print(f"Loading dataset from: {dataset_path}")

# 3. Load dataset
# Detect if the file has headers
try:
    df_preview = pd.read_csv(dataset_path, nrows=5)
    has_header = 'Label' in df_preview.columns or 'label' in df_preview.columns or 'N' in df_preview.columns
except Exception as e:
    has_header = False

if has_header:
    df = pd.read_csv(dataset_path)
    # Rename columns to standard casing if needed
    col_map = {c: c.capitalize() for c in df.columns}
    df = df.rename(columns=col_map)
else:
    # If no header, assume standard columns from Pending work.txt
    print("No header detected. Assuming standard columns: ['Timestamp','N','P','K','Moisture','Temperature','Label']")
    df = pd.read_csv(dataset_path, names=['Timestamp','N','P','K','Moisture','Temperature','Label'])

# Drop Timestamp if present
if 'Timestamp' in df.columns:
    print("Dropping 'Timestamp' column...")
    df = df.drop(columns=['Timestamp'])

# 4. Data Preprocessing
print("Original dataset shape:", df.shape)

# Drop rows where critical fields are not numeric
for col in ['N', 'P', 'K', 'Moisture', 'Temperature']:
    if col in df.columns:
        df[col] = pd.to_numeric(df[col], errors='coerce')

df = df.dropna(subset=['N', 'P', 'K', 'Moisture', 'Temperature', 'Label'])

# Filter low moisture rows (threshold from Pending work.txt: >= 35)
original_len = len(df)
df = df[df['Moisture'] >= 35]
dropped_moisture = original_len - len(df)
if dropped_moisture > 0:
    print(f"Dropped {dropped_moisture} rows with Moisture < 35%")

# Convert types
df['N'] = df['N'].astype(int)
df['P'] = df['P'].astype(int)
df['K'] = df['K'].astype(int)
df['Moisture'] = df['Moisture'].astype(float)
df['Temperature'] = df['Temperature'].astype(float)

# Class balance
print("\nClass distribution in preprocessed dataset:")
print(df['Label'].value_counts())

# Features and target
features = ['N', 'P', 'K', 'Moisture', 'Temperature']
X = df[features]
y = df['Label']

# 5. Train-Test Split (80% train, 20% test, stratified)
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, stratify=y, random_state=42
)

# 6. Feature Scaling
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

# Format scaler parameters for C firmware
print("\n" + "="*50)
print("  SCALER PARAMETERS FOR ESP32 FIRMWARE")
print("="*50)
print("// Copy these lines into your ESP32 model.h / main firmware:")
for i, feature in enumerate(features):
    mean_val = scaler.mean_[i]
    std_val = scaler.scale_[i]
    print(f"float {feature}_mean = {mean_val:.6f}f;")
    print(f"float {feature}_std  = {std_val:.6f}f;")
print("="*50 + "\n")

# 7. Model Training (Random Forest)
print("Training Random Forest Classifier (50 estimators)...")
model = RandomForestClassifier(n_estimators=50, random_state=42)
model.fit(X_train_scaled, y_train)
print("Model training complete.")

# 8. Evaluation
y_pred = model.predict(X_test_scaled)
print("\nClassification Report:")
print(classification_report(y_test, y_pred))

# Save Confusion Matrix plot
plt.figure(figsize=(6, 5))
cm = confusion_matrix(y_test, y_pred)
sns.heatmap(cm, annot=True, fmt='d', cmap='Blues',
            xticklabels=model.classes_,
            yticklabels=model.classes_)
plt.title('Confusion Matrix')
plt.ylabel('True Label')
plt.xlabel('Predicted Label')
plt.tight_layout()
cm_plot_path = 'confusion_matrix.png'
plt.savefig(cm_plot_path)
plt.close()
print(f"Saved confusion matrix plot to '{cm_plot_path}'")

# Save Feature Importance plot
plt.figure(figsize=(6, 4))
feat_imp = pd.Series(model.feature_importances_, index=features)
feat_imp.sort_values().plot(kind='barh', color='teal')
plt.title('Feature Importance')
plt.xlabel('Importance Score')
plt.tight_layout()
fi_plot_path = 'feature_importance.png'
plt.savefig(fi_plot_path)
plt.close()
print(f"Saved feature importance plot to '{fi_plot_path}'")

# 9. Model Export via m2cgen
if m2c_available:
    print("\nExporting model to C code via m2cgen...")
    c_code = m2c.export_to_c(model)
    output_c_file = 'model.c'
    with open(output_c_file, 'w') as f:
        f.write(c_code)
    print(f"Successfully exported C model to '{output_c_file}'")
    print(f"Size of exported model: {len(c_code)} characters")
else:
    print("\nNote: 'm2cgen' is not installed. Skipping C code generation.")
    print("To export the model to C code, please install it: pip install m2cgen")
    print("And run this script again.")
