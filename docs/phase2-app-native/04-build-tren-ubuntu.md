# Build app Android GreenCA trên Ubuntu — hướng dẫn tự chứa

Làm theo từ trên xuống. Không cần đọc tài liệu nào khác.

**Kết quả cuối:** file `app-debug.apk` chạy được trên emulator hoặc điện thoại Android.

**Việc KHÔNG làm được trên Ubuntu:** build app iOS. Apple bắt buộc macOS + Xcode, không có cách nào khác (kể cả máy ảo macOS cũng vi phạm điều khoản licence của Apple). Phần iOS phải làm trên MacBook.

---

## 0. Tình trạng hiện tại của công việc

| | |
|---|---|
| Nhánh | `poc/capacitor-android` |
| Commit | `7506489` — *feat(mobile): POC Capacitor — app khách hàng chạy trên Android* |
| Đã chạy được | App khách hàng trên emulator Android API 36: splash → đăng nhập → gọi API staging → hiển thị phản hồi từ server |
| Chưa làm | Vỏ app tài xế; push notification; app iOS |
| Capacitor | 8.5.0 (yêu cầu Node ≥ 22 và compileSdk 36) |

Thiết kế đầy đủ: `docs/superpowers/specs/2026-08-02-mobile-native-apps-design.md`
Yêu cầu thiết bị hai nền tảng: `docs/MOBILE.md`

---

## 1. Cài công cụ trên Ubuntu

### 1.1 Node.js 22

Capacitor 8 yêu cầu Node ≥ 22. Bản trong apt của Ubuntu thường cũ hơn, nên dùng nvm:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
exec $SHELL
nvm install 22
node -v            # phải ra v22.x
```

### 1.2 JDK 21

```bash
sudo apt update
sudo apt install -y openjdk-21-jdk
java -version      # phải ra 21.x
```

Ghi `JAVA_HOME` vào shell profile để Gradle luôn tìm thấy:

```bash
echo 'export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64' >> ~/.bashrc
```

### 1.3 Android SDK (không cần Android Studio)

Tải Android Studio đầy đủ mất ~12 GB và phải click qua GUI. Chỉ cần command-line tools là đủ (~2,5 GB kể cả emulator):

```bash
mkdir -p ~/Android/Sdk/cmdline-tools
cd ~/Android/Sdk/cmdline-tools
# Lấy link "Command line tools only" cho Linux tại
# https://developer.android.com/studio#command-line-tools-only
wget https://dl.google.com/android/repository/commandlinetools-linux-<VERSION>_latest.zip
unzip commandlinetools-linux-*.zip
mv cmdline-tools latest        # bắt buộc phải nằm ở cmdline-tools/latest
```

Khai biến môi trường (thêm vào `~/.bashrc`):

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
```

Mở terminal mới rồi cài các gói. **`platforms;android-36` là bắt buộc** — Capacitor 8 dùng compileSdk 36, thiếu là Gradle fail:

```bash
yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0" \
           "emulator" "system-images;android-36;google_apis_playstore;x86_64"
```

> Chọn image **`google_apis_playstore`** (hoặc `google_apis`), **đừng** chọn bản trần — bản trần không có Google Play Services nên sau này không test được push FCM.

### 1.4 Tăng tốc emulator bằng KVM — đừng bỏ bước này

Không có KVM thì emulator chậm đến mức không dùng được:

```bash
sudo apt install -y qemu-kvm
sudo adduser $USER kvm
# ĐĂNG XUẤT rồi đăng nhập lại để quyền nhóm có hiệu lực
kvm-ok            # phải báo "KVM acceleration can be used"
```

Nếu `kvm-ok` không có thì `sudo apt install cpu-checker`.

Nếu emulator khởi động rồi báo thiếu thư viện, cài thêm:

```bash
sudo apt install -y libpulse0 libnss3 libxcursor1 libxdamage1 libxrandr2 libxi6
```

### 1.5 Tạo máy ảo

```bash
android emulator create medium_phone
android emulator list
```

> **Cạm bẫy đã gặp:** `avdmanager create avd` của bản cmdline-tools mới báo `Package path is not valid. Valid system image paths are: null` dù `sdkmanager --list_installed` vẫn thấy image. Đây là lỗi của `avdmanager`. Dùng CLI mới `android emulator create` như trên là được.

Khởi động (mất vài phút lần đầu):

```bash
android emulator start medium_phone
adb devices        # chờ tới khi trạng thái là "device", không phải "offline"
```

---

## 2. Lấy code

Công việc nằm trên nhánh `poc/capacitor-android`, commit `7506489`.

```bash
git clone git@github.com:mrduong92/green-car-airport.git
cd green-car-airport
git checkout poc/capacitor-android
git log --oneline -1        # phải thấy 7506489
```

> Nếu nhánh chưa được push lên remote, xem mục 6 để chuyển code sang máy bằng file.

---

## 3. Build bundle web

**Phải `npm ci` mới trên Ubuntu.** `node_modules` chứa binary biên dịch theo nền tảng (rolldown/Vite), copy từ máy macOS sang sẽ lỗi.

```bash
cd frontend
npm ci
```

Build bundle app khách hàng, truyền URL API tuyệt đối:

```bash
# Bản thử nghiệm — trỏ staging (khuyến nghị khi test)
VITE_API_BASE_URL=https://webco.io.vn npm run build:customer

# Bản dùng dữ liệu thật — trỏ production
VITE_API_BASE_URL=https://greenca.vn npm run build:customer
```

**Vì sao phải truyền biến này:** bản web được server phát ra nên `/api` tương đối tự trỏ đúng. Bản app thì bundle nằm trong file cài trên máy người dùng, không có server nào phát ra nó, nên buộc phải biết địa chỉ tuyệt đối. Quên biến này là app gọi vào chính vỏ app và mọi request chết.

Kiểm chứng URL đã được nhúng vào bundle:

```bash
grep -o "https://webco\.io\.vn" dist/assets/*.js | head -1
```

Không ra gì tức là chưa nhúng — kiểm tra lại biến môi trường.

---

## 4. Build APK

```bash
cd ../mobile/customer
npm ci
echo "sdk.dir=$ANDROID_HOME" > android/local.properties

npx cap sync android
cd android
./gradlew assembleDebug
```

Lần đầu Gradle tải distribution và Android Gradle Plugin, mất khoảng 4–5 phút. Các lần sau nhanh hơn nhiều.

APK nằm ở: `mobile/customer/android/app/build/outputs/apk/debug/app-debug.apk`

Cài lên emulator hoặc điện thoại đang cắm cáp:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n vn.greenca.customer/.MainActivity
```

Chờ 10–15 giây cho WebView nạp bundle rồi mới thao tác — bấm sớm thì thao tác rơi vào lúc app còn đang tải.

---

## 5. Những chỗ đã vướng và cách xử lý

Ba cái này đã gặp thật khi làm POC, ghi lại để không mất thời gian lần nữa.

### 5.1 `CSRF token mismatch` (419) — mất nhiều thời gian nhất

Capacitor mặc định nạp WebView từ origin `https://localhost` (Android) và `capacitor://localhost` (iOS). Cả hai có host là `localhost`, mà `localhost` nằm trong danh sách mặc định của `SANCTUM_STATEFUL_DOMAINS` (xem `backend/config/sanctum.php:21-26`; `.env` không khai biến này nên đang dùng mặc định).

Sanctum liền coi app là SPA first-party, chuyển request sang luồng session/cookie và bắt CSRF token → **mọi request trả 419**, đăng nhập không thực hiện được.

Rất dễ chẩn đoán sai thành lỗi CORS. Dấu hiệu phân biệt: app **có** gọi tới server (thấy toast lỗi do server trả về, không phải lỗi mạng), và nội dung đúng là `CSRF token mismatch.`

Đã xử lý trong `mobile/customer/capacitor.config.ts` — **đừng xoá đoạn này**:

```ts
server: { androidScheme: 'https', hostname: 'app.greenca.vn' }
```

Origin thành `https://app.greenca.vn`, không còn khớp `localhost` → Sanctum để request đi luồng stateless bằng Bearer token.

Nên khai tường minh trên server để bịt gốc (chưa làm):

```
SANCTUM_STATEFUL_DOMAINS=greenca.vn,driver.greenca.vn,admin.greenca.vn
```

### 5.2 CORS thì không phải vấn đề

Staging và production đang trả `Access-Control-Allow-Origin: *` (mặc định Laravel 11+ khi không có `config/cors.php`), nên app gọi API được ngay. Chỉ cần lưu ý nếu sau này siết CORS về danh sách cụ thể thì phải thêm origin `https://app.greenca.vn`.

### 5.3 Lỗi Capacitor nội bộ trong log — bỏ qua được

```
Error injecting safe area CSS: TypeError: Cannot read properties of null (reading 'style')
```

Lỗi nội bộ của Capacitor 8, xuất hiện 3 lần mỗi lần khởi động, không ảnh hưởng gì. Đừng mất thời gian truy.

### 5.4 Gỡ lỗi

Xem log nhanh:

```bash
adb logcat -c                                    # xoá log cũ
# thao tác trên app
adb logcat -d | grep -iE "Capacitor|Console"
```

Debug bằng DevTools như web thường: mở Chrome trên Ubuntu → `chrome://inspect` → thấy WebView của app → Inspect.

Chụp màn hình emulator:

```bash
adb exec-out screencap -p > /tmp/shot.png
```

---

## 6. Nếu nhánh chưa có trên remote

Tạo file bundle trên máy macOS rồi copy qua USB/Drive:

```bash
# trên macOS
git bundle create ~/greenca-poc.bundle poc/capacitor-android

# trên Ubuntu, sau khi đã clone repo
git fetch ~/greenca-poc.bundle poc/capacitor-android:poc/capacitor-android
git checkout poc/capacitor-android
```

**Đừng copy thẳng cả thư mục project** giữa hai máy — `node_modules` và thư mục build của Gradle chứa binary theo nền tảng, sẽ gây lỗi rất khó hiểu.

---

## 7. Việc còn lại

Theo thứ tự ưu tiên:

1. **Vỏ app tài xế** — lặp lại mục 4 với `mobile/driver`, `webDir` là `../../frontend/dist-driver`, appId `vn.greenca.driver`, hostname `driver-app.greenca.vn`. Đây là app cần kiểm chứng realtime Reverb khi nhận cuốc.
2. **Tách build theo môi trường** — bản staging phải có appId khác (`vn.greenca.customer.staging`) để cài song song với bản production trên máy tester mà không ghi đè nhau.
3. **Cơ chế buộc cập nhật** — chưa có, và phải có mặt ngay ở bản phát hành đầu tiên. Người dùng không bắt buộc cập nhật app, nên nếu sau này đổi domain hoặc cần sửa lỗi nghiêm trọng thì không có cách nào tiếp cận những người đang dùng bản cũ.
4. **Push notification FCM** — xem mục 3 của spec. Test được toàn bộ trên Ubuntu, kể cả bằng emulator, không cần tài khoản Play Console.
5. **App iOS** — chỉ làm được trên MacBook, và push iOS cần tài khoản Apple Developer trả phí 99 USD/năm.
